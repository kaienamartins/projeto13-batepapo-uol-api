import express from "express";
import { MongoClient, ObjectId } from "mongodb";
import dotenv from "dotenv";
import cors from "cors";
import dayjs from "dayjs";
import joi from "joi";

const app = express();
dotenv.config();
app.use(cors());
app.use(express.json());
const port = 5000;

const mongoClient = new MongoClient(process.env.DATABASE_URL);
try {
  await mongoClient.connect();
  console.log("Conectado ao banco de dados");
} catch (err) {
  console.error(err.message);
}

const db = mongoClient.db();

app.post("/participants", async (req, res) => {
  const { name } = req.body;
  const time = dayjs().format("HH:mm:ss");

  const participantSchema = joi.object({
    name: joi.string().required(),
  });

  const validation = participantSchema.validate(req.body);

  if (validation.error) return res.sendStatus(422);

  db.collection("participants")
    .findOne({ name})
    .then((info) => {
      if (info) {
        return res.sendStatus(409);
      } else {
        db.collection("participants")
          .insertOne({
            name: name,
            lastStatus: Date.now(),
          })
          .then(() => {
            db.collection("messages")
              .insertOne({
                from: name,
                to: "Todos",
                text: "entra na sala...",
                type: "status",
                time: time,
              })
              .then(() => res.sendStatus(201))
              .catch((err) => res.send(err.message));
          })
          .catch((err) => res.send(err.message));
      }
    })
    .catch((err) => res.send(err.message));
});

app.get("/participants", async (req, res) => {
  try {
    const participants = await db.collection("participants").find().toArray();
    res.send(participants);
  } catch (err) {
    res.status(500).send(err.message);
  }
});

app.post("/messages", async (req, res) => {
  const { to, text, type } = req.body;
  const { user } = req.headers;
  const time = dayjs().format("HH:mm:ss");
  try {
    const recipient = await db
      .collection("participants")
      .findOne({ name: user });

    if (!recipient) {
      res.status(422).send("Destinatário não encontrado");
      return;
    }

    const messageSchema = joi.object(
      {
        to: joi.string().required(),
        text: joi.string().required(),
        type: joi.valid("message", "private_message").required(),
      },
      { abortEarly: false }
    );
    if (messageSchema.error) {
      const errors = messageSchema.error.details.map((err) => err.message);
      res.status(422).send(errors);
      return;
    }

    await db.collection("messages").insertOne({
      from: user,
      to,
      text,
      type,
      time: time,
    });
    res.status(201).send();
  } catch (err) {
    return res.status(500).send(err.message);
  }
});

app.get("/messages", (req, res) => {
  const limit = req.query.limit;
  const user = req.headers.user;

  const message = {
    $or: [{ to: user }, { from: user }, { to: "Todos" }, { type: "message" }],
  };

  const lastMessages = {
    sort: { _id: -1 },
  };

  if (limit && (isNaN(limit) || limit <= 0)) {
    return res.sendStatus(422);
  }

  db.collection("messages")
    .find(message, lastMessages)
    .toArray()
    .then((messages) => {
      if (messages && messages.length > 0) {
        if (limit) {
          messages = messages.slice(0, parseInt(limit));
        }
        res.send(messages);
      } else {
        res.sendStatus(404);
      }
    })
    .catch((err) => res.sendStatus(500));
});

app.post("/status", async (req, res) => {
  const user = req.headers.user;
  const lastStatus = Date.now();

  try {
    const participant = await db
      .collection("participants")
      .findOne({ name: user });

    if (!user) return res.status(404).send();
    if (!participant) return res.status(404).send();

    await db
      .collection("participants")
      .updateOne({ name: user }, { $set: { lastStatus } });

    res.status(200).send();
  } catch (err) {
    res.status(500).send(err.message);
  }
});

setInterval(async () => {
  const timeNow = dayjs().format("HH:mm:ss");
  const dateNow = Date.now();

  db.collection("participants")
    .find({ lastStatus: { $lt: dateNow - 10000 } })
    .toArray()
    .then((info) => {
      info.forEach((user) => {
        const { name, _id } = user;

        db.collection("participants")
          .deleteOne({ _id: new ObjectId(_id.toString()) })
          .then(
            db.collection("messages").insertOne({
              from: name,
              to: "Todos",
              text: "sai da sala...",
              type: "status",
              time: timeNow,
            })
          );
      });
    });
}, 15000);

app.listen(port, () => console.log(`Servidor rodando na porta ${port}`));
