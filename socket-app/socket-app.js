class SocketApp {
    constructor(io, connectionName) {
        this.connectionName = connectionName;
        this.server = io.of('/' + connectionName);
        this.sockets = [];
        this.server.on('connection', (socket) => {
            let onevent = socket.onevent;
            socket.onevent = function (packet) {
                console.log("SocketApp '" + connectionName + "' received: " + JSON.stringify(packet.data));
                onevent.call(this, packet);    // original call
            };
            this.sockets[socket.id] = socket;
            this.onConnect(socket)
        });
        console.log("Loaded socket connection '" + this.connectionName + "'")
    }
}

module.exports = SocketApp;
