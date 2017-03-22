import express = require("express");
import bodyParser = require("body-parser");

const app: express.Application = express();
const port: Number = 1975;

let messages: String[] = [];

app.use(bodyParser.json());
app.use(bodyParser.urlencoded({extended: true}));

app.post("/messages", (request: express.Request, response: express.Response): void => {
  let message: String = request.body.message;
  console.log("Received message '" + message + "'");
  if (typeof message !== "undefined" && message !== null) messages.push(message);
  response.send(messages);
});

app.get("/messages", (request: express.Request, response: express.Response): void => {
  response.send(messages);
});

app.get("/", (request: express.Request, response: express.Response): void => {
  response.send("Hello, world!");
});

app.listen(port, () => {
  console.log("Server listening on port " + port);
});
