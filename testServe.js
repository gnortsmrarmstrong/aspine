#!/bin/node

// --------------- Includes ------------------
const express = require('express');
const scraper = require('./scrape.js');
const bodyParser = require('body-parser');
const session = require('express-session');
const http = require('http');
const socketio = require('socket.io');

// -------------------------------------------


// ------------ Web Server -------------------
const app = express();
const server = http.createServer(app);
const io = socketio(server);
const port = 8080;

app.use(express.static('public')); // Serve any files in public directory
app.use(express.static('node_modules/socket.io')); // Serve any files in public directory
app.use(bodyParser.urlencoded({ extended: true })); // Allows form submission
app.use(session({ // Allows for sessions, and signs them with the (arbitrary) secret
	secret: "scheming+anaconda+bunkbed+greeting+octopus+ultimate+viewable+hangout+everybody"
}));

app.post('/data', async (req, res) => {
	console.log(`\n\nNEW LOGIN: ${req.session.username}\n------------------`);

	// USE REAL DATA:
	//res.send(await scraper.scrape_student(req.session.username, req.session.password));

	// USE FAKE DATA:
	res.sendFile('sample.json', {root:"public"});
});
app.post('/login', async (req, res) => {
	req.session.username = req.body.username;
	req.session.password = req.body.password;
	res.sendFile('home.html', {root:"public"});
});

app.post('/logout', async (req, res) => {
	res.sendFile('index.html', {root:"public"});

});

io.on('connection', function(socket){
	console.log('a user connected');
});

app.listen(port, () => console.log(`Example app listening on port ${port}!`));

// -------------------------------------------