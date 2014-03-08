var express = require('express'),
    app = express(),
    server = require('http').createServer(app),
    io = require('socket.io').listen(server);

app.use(express.static(__dirname + '/public'));

server.listen(8888);

io.sockets.on('connection', function (socket) {
    socket.on('join', function (room, name) {
        console.log('client joined '+room);
        socket.name = name + '-' + socket.id.substr(0, 5);
        socket.join(room);
        var peerIds = io.sockets.clients(room)
            .filter(function (s) { return s.id !== socket.id; })
            .map(function (s) { return { id: s.id, name: s.name }; });
        socket.emit('peers', peerIds);
        socket.broadcast.to(room).emit('peer', { id: socket.id, name: socket.name });
    });
    socket.on('leave', function (room) {
        socket.leave(room);
    });
    socket.on('message', function (json) {
        var data;
        try {
            data = JSON.parse(json);
        } catch (error) {
            console.error(error);
            return;
        }
        if (data.to) {
            var to = io.sockets.sockets[data.to];
            if (to) {
                to.send(JSON.stringify({
                    from: socket.id,
                    message: data.message
                }));
            }
        }
    });
});
