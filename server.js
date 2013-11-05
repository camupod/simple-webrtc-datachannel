var express = require('express'),
    app = express(),
    server = require('http').createServer(app),
    io = require('socket.io').listen(server);

app.use(express.static(__dirname + '/public'));

server.listen(8000);

io.sockets.on('connection', function (socket) {
    socket.on('join', function (room) {
        console.log('client joined '+room);
        socket.join(room);
        var peerIds = io.sockets.clients(room)
            .filter(function (s) { return s.id !== socket.id; })
            .map(function (s) { return s.id; });
        socket.emit('peers', peerIds);
        socket.broadcast.to(room).emit('peer', socket.id);
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
        console.log(data);
        if (data.to) {
            io.sockets.sockets[data.to].send(JSON.stringify({
                from: socket.id,
                message: data.message
            }));
        }
    });
});
