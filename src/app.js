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
  const lastStatus = Date.now();
  const time = dayjs().format("HH:mm:ss");
  const participant = { name, lastStatus };

  const participantSchema = joi.object({
    name: joi.string().required(),
  });

  const validation = participantSchema.validate(req.body, {
    abortEarly: false,
  });

  if (validation.error) {
    const errors = validation.error.details.map((detail) => detail.message);
    return res.status(422).send(errors);
  }

  try {
    const userExists = await db.collection("participants").findOne({ name });
    if (userExists) return res.status(409).send("Esse nome já foi cadastrado");

    await db.collection("participants").insertOne(participant);
    const message = {
      from: name,
      to: "Todos",
      text: "entra na sala...",
      type: "status",
      time: time,
    };
    await db.collection("messages").insertOne(message);
    res.status(201).send();
  } catch (err) {
    res.status(500).send(err.message);
  }
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
  const from = req.headers.user;

  const recipient = await db.collection("participants").findOne({ name: to });
  if (!recipient) {
    return res.status(422).send("Destinatário não encontrado");
  }

  if (!from) {
    return res.status(422).send("Cabeçalho 'User' não presente");
  }

  const messageSchema = joi.object({
    to: joi.string().required(),
    text: joi.string().required(),
    type: joi.string().valid("message", "status").required(),
  });

  const validation = messageSchema.validate(req.body, { abortEarly: false });

  if (validation.error) {
    const errors = validation.error.details.map((detail) => {
      const { message, context } = detail;
      return `${context.label} ${message}`;
    });
    return res.status(422).send(errors);
  }

  try {
    const participant = await db
      .collection("participants")
      .findOne({ name: from });

    if (!participant) {
      return res.status(422).send("Usuário não cadastrado");
    }

    await db.collection("messages").insertOne({
      from,
      to,
      text,
      type,
      time: dayjs().format("HH:mm:ss"),
    });

    return res.status(201).send();
  } catch (err) {
    return res.status(500).send(err.message);
  }
});

app.get("/messages", async (req, res) => {
  const user = req.headers.user;
  const limit = Number(req.query.limit);

  if (!Number.isInteger(limit) || limit < 1) {
    return res.status(422).send();
  }

  try {
    const messages = await db
      .collection("messages")
      .find({
        $or: [{ to: "Todos" }, { to: user, type: "message" }, { from: user }],
      })
      .sort({ _id: -1 })
      .limit(Number(limit))
      .toArray();
    if (limit) res.send(messages);
  } catch (err) {
    res.status(500).send(err.message);
  }
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
  const tenSeconds = Date.now() - 10000;
  const participantsToRemove = await db
    .collection("participants")
    .find({ lastStatus: { $lt: tenSeconds } })
    .toArray();
  const namesToRemove = participantsToRemove.map((p) => p.name);

  if (namesToRemove.length > 0) {
    await db
      .collection("participants")
      .deleteMany({ name: { $in: namesToRemove } });

    for (const name of namesToRemove) {
      const message = {
        from: name,
        to: "Todos",
        text: "sai da sala...",
        type: "status",
        time: dayjs().format("HH:mm:ss"),
      };

      await db.collection("messages").insertOne(message);
    }
  }
}, 15000);

app.listen(port, () => console.log(`Servidor rodando na porta ${port}`));
