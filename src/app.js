import express from "express";
import { MongoClient, ObjectId } from "mongodb";
import dotenv from "dotenv";
import cors from "cors";
import dayjs from "dayjs";

const app = express();
dotenv.config();
app.use(cors());
app.use(express.json());
const port = 5000;
let db;

const mongoClient = new MongoClient(process.env.DATABASE_URL);
mongoClient.connect().then(() => {
  db = mongoClient.db();
  app.listen(port, () => {
    console.log(`Servidor rodando na porta ${port}`);
  });
}).catch((err) => {
  console.error(err);
});

app.post("/participants", async (req, res) => {
  const { name } = req.body;
  const lastStatus = Date.now();
  const time = dayjs().format("HH:mm:ss");
  const participant = { name, lastStatus };

  if (name === "" || name === undefined) {
    return res.status(422).send("Você precisa informar um nome");
  }

  try {
    const userExists = await db.collection("participants").findOne({ name });
    if (userExists) {
      return res.status(409).send("Esse nome já foi cadastrado");
    }
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
    console.error(err);
    res.status(500).send("Erro interno do servidor");
  }
});