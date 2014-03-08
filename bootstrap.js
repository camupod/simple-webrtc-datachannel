var express = require('express'),
    app = express(),
    server = require('http').createServer(app),
    io = require('socket.io').listen(server);

app.use(express.static(__dirname + '/public'));

server.listen(8888);

io.sockets.on('connection', function (socket) {
    var randomClientId;
    if (io.sockets.clients().length > 1) {
        do {
            randomClientId = getRandomClient();
        } while(randomClientId === socket.id);
        socket.emit('peer', randomClientId);
    }
    socket.emit('id', socket.id);
    socket.on('msg', function (to, data) {
        console.log(to, data);
        var client = io.sockets.sockets[to];
        if (client) {
            client.emit('msg', socket.id, data);
        }
    });
});

function getRandomClient() {
    var clients = io.sockets.clients();
    return clients[(Math.random() * clients.length) | 0].id;
}
