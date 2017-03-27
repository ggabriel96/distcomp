import { Message } from "./Message";

import ip = require('ip');
import express = require("express");
import winston = require("winston");
import bodyParser = require("body-parser");

const port: Number = 1975;
const ipAddress: string = ip.address();
const app: express.Application = express();
const logger: winston.LoggerInstance = new winston.Logger({
  transports: [
      new winston.transports.Console({
        level: 'silly'
      })
  ]
});

let messages: Message[] = [];

app.use(bodyParser.json());
app.use(bodyParser.urlencoded({extended: true}));

app.post("/messages", (request: express.Request, response: express.Response): void => {
  let message: Message = new Message(request.body.user, request.body.content);
  if (message.isValid()) {
    logger.debug("Received message " + message);
    messages.push(message);
    response.send(message);
  } else {
    logger.debug("Received invalid message " + message)
    response.send();
  }
});

app.get("/messages", (request: express.Request, response: express.Response): void => {
  response.send(messages);
});

app.get("/", (request: express.Request, response: express.Response): void => {
  response.send("Hello, world!");
});

app.listen(port, () => {
  logger.info("Server listening on http://" + ipAddress + ":" + port);
});