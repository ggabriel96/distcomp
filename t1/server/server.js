const express = require('express');
const app = express();
const port = 1975;

app.get('/', function(req, res) {
  res.send('Hello World!');
});

app.listen(port, function() {
  console.log("Server listening on port " + port);
});
