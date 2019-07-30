"use strict";
const ws = require("ws");
const url = require("url");
const https = require("https");
const fs = require("fs");
const config = require("./config.json");
const WebSocketServer = ws.Server;

var sources = [];

function broadcast(event, data, filter) {
	if (!ws_server) { 
		return;
	}
	const message = JSON.stringify({
		event: event,
		data: data
	});
	for (var connection of ws_server.clients) { 
		if (connection.filter === filter) { 
			try {
				connection.send(message);
			} catch (e) { 
				console.log("SEND ERROR", event, filter, e);
			}
		}
	}
}

function concat_rooms(filter) { 
	var all_rooms = [];
	for (var source of sources) {
		all_rooms = all_rooms.concat(source.rooms[filter]);
	}
	if (config.compat) { 
		for (var i in all_rooms) { 
			if (all_rooms[i].options && all_rooms[i].options.duel_rule) { 
				all_rooms[i].options.enable_priority = (all_rooms[i].options.duel_rule !== 4);
			}
		}
	}
	return all_rooms;
}

function init_source(source, filter) {
	const wssurl = source.url + "/?filter=" + filter;
	//console.log(wssurl);
	var cli = new ws(wssurl);
	cli.on("open", () => {
		console.log("CONNECTED", source.url, filter)
	});
	cli.on("close", (code, reason) => {
		console.log("CLOSED", source.url, filter, code, reason);
		init_source(source, filter);
	});
	cli.on("error", (code, reason) => {
		console.log("ERRORED", source.url, filter, code, reason);
		init_source(source, filter);
	});
	cli.on("message", (raw_data) => {
		try {
			const data = JSON.parse(raw_data);
			switch (data.event) { 
				case "init": {
					source.rooms[filter] = data.data;
					broadcast("init", concat_rooms(filter), filter);
					break;
				}
				case "create": { 
					source.rooms[filter].push(data.data);
					broadcast("create", data.data, filter);
					break;
				}
				case "update": { 
					const name = data.data.id;
					const index = source.rooms[filter].findIndex((room) => {
						return room.id === name;
					});
					if (index !== -1) {
						source.rooms[filter][index] = data.data;
					}
					broadcast("update", data.data, filter);
					break;
				}
				case "delete": { 
					const name = data.data;
					const index = source.rooms[filter].findIndex((room) => {
						return room.id === name;
					});
					if (index !== -1) { 
						source.rooms[filter].splice(index, 1);
					}
					broadcast("delete", name, filter);
					break;
				}
			};
			console.log("MESSAGE", source.url, filter, data.event, source.rooms[filter].length);
		}
		catch (e) { 
			console.log("BAD DATA", source.url, filter, e);
		}
	});
	source.ws_clients[filter] = cli;
}

const https_server = https.createServer({
	cert: fs.readFileSync(config.ssl.cert),
	key: fs.readFileSync(config.ssl.key)
}, () => { });

const ws_server = new WebSocketServer({
	server: https_server
});
ws_server.on("connection", (connection) => {
	connection.filter = url.parse(connection.upgradeReq.url, true).query.filter || 'waiting';
	connection.send(JSON.stringify({
		event: 'init',
		data: concat_rooms(connection.filter)
	}));
});

for (var server of config.servers) {
	var source = {
		url: server,
		rooms: {
			waiting: [],
			started: []
		},
		ws_clients: {
			waiting: null,
			started: null
		}
	};
	sources.push(source);
	init_source(source, "waiting");
	init_source(source, "started");
}

https_server.listen(config.port);
