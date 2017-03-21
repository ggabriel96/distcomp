import express = require("express");

const app: express.Application = express();
const port: Number = 1975;

app.get("/", (request: express.Request, response: express.Response): void => {
  response.send("Hello, world!");
});

app.listen(port, () => {
  console.log("Server listening on port " + port);
});
