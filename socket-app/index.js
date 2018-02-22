
let fs = require('fs'); //research
let path = require('path'); //reaserch
let io = require('socket.io');

class socketApp {
    constructor(server) {
        this.io = io(server);
        let connectionDir = './connections';
        let files = fs.readdirSync(path.join(__dirname, connectionDir));
        if (files) {
            files.forEach((file) => {
                try {
                    let connectionName = path.basename(file,'.js');
                    let SocketApp = require(path.join(__dirname, connectionDir, file));
                    new SocketApp(this.io, connectionName);
                }
                catch (ex) {
                    console.log("Unable to load socket connection " + file + '\n' + ex.stack);
                }
            })
        }
    }
}

module.exports = socketApp;
