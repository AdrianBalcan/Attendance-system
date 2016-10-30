var express = require('express');
var app = express();
var server = require('http').Server(app);
var io = require('socket.io')(server);
var GT511C3 = require('gt511c3');
var async = require('async');
var fs = require('fs');
var Promise = require("promise");

var ID_TO_USE = 2;


app.use(express.static(__dirname + '/public'));

app.get('/test', function(req, res) {
    res.sendFile(__dirname + '/views/index.html');
});

app.get('/start', function(req, res) {
    res.send('wee');
    start();
});

app.get('/enroll', function(req, res) {
    enroll = 1;
    console.log(enroll);
});

var fps = new GT511C3('/dev/ttyAMA0', {
    baudrate: 115200,
        //baudrate: 57600,
        //baudrate: 38400,
        //baudrate: 19200,
        //baudrate: 9600,
        //debug: true
});

function release() {
    return (new Promise(function(resolve, reject) {
        var check = function() {
            fps.isPressFinger().then(function() {
                setTimeout(function() {
                    check();
                }, 100);
            }, function(err) {
                io.sockets.in(room).emit('clear');
                resolve();
            });
        }
        check();
    }));
}

function start() {
console.log('ready');
enroll = 99;
waitFinger().then(function(){
console.log('go');
        fps.deleteID(ID_TO_USE).then(function() {
            console.log('deleteID: ' + ID_TO_USE + ' deleted!');
        }, function(err) {
            console.log('deleteID err ' + ID_TO_USE + ': ' + fps.decodeError(err));
        });
		fps.enrollStart(ID_TO_USE).then(function() {
			console.log('enrollStart: ' + ID_TO_USE + ' enroll started!');
		}, function(err) {
			console.log('enrollStart error ' + ID_TO_USE +': ' + fps.decodeError(err));
		});
});
}

var enroll = 0;

function identify() {
    if (enroll == 0) {
        fps.captureFinger(0)
            .then(function() {
                return fps.identify();
            })
            .then(function(ID) {
                io.sockets.in(room).emit('identify-ok', ID);
                release().then(function() {
                    identify()
                });
            }, function(err) {
                if (err == 4104) {
                    io.sockets.in(room).emit('identify-err');
                    release().then(function() {
                        identify()
                    });
                } else {
                    setTimeout(function() {
                        identify();
                    }, 100);
                }
            });
    } else {
        enroll_identify();
        io.sockets.in(room).emit('enroll', 1);
    }
}


function enroll_identify() {
    console.log('enroll_identify');
    if (enroll == 1) {
        fps.captureFinger(0)
            .then(function() {
                return fps.identify();
            })
            .then(function(ID) {
                io.sockets.in(room).emit('enroll-identify-err');
                release().then(function() {
                    enroll_identify()
                });
            }, function(err) {
                console.log("identify err: " + fps.decodeError(err));
                if (err == 4104) {
                    release().then(function() {
                        eee()
                    });
                    enroll = 2;
                    console.log(enroll);
                    io.sockets.in(room).emit('enroll-identify-ok');
                } else {
                    setTimeout(function() {
                        enroll_identify();
                    }, 200);
                }
            });
    }
}

function waitFinger() {
    return (new Promise(function(resolve, reject) {
        var check = function() {
            fps.isPressFinger().then(function() {
                io.sockets.in(room).emit('clear');
                resolve();
            }, function(err) {
                setTimeout(function() {
                    check();
                }, 100);
            });
        }
        check();
    }));
}

function eee() {
    if (enroll == 2) {
        fps.deleteID(ID_TO_USE).then(function() {
            console.log('deleteID: ' + ID_TO_USE + ' deleted!');
        }, function(err) {
            console.log('deleteID err ' + ID_TO_USE + ': ' + fps.decodeError(err));
        });
            fps.enrollStart(ID_TO_USE).then(function() {
                console.log('enrollStart: ' + 0 + ' enroll started!');
                waitFinger().then(function() {
                    fps.captureFinger().then(function() {
                        console.log('captureFinger: OK!');
                        fps.enroll1().then(function() {
                            console.log('enroll1 OK!');
                        }, function(err) {
                            console.log('enroll1 error: ' + fps.decodeError(err));
                        });
                    }, function(err) {
                        console.log('captureFinger err: ' + fps.decodeError(err));
                    });
                });
            }, function(err) {
                console.log('enrollStart error: ' + fps.decodeError(err));
            });
        console.log('test');
    }
}

function enroll() {
    console.log('enroll--');
    if (enroll == 2) {};
}


fps.init().then(
    function() {
        isInit = true;
        console.log('init: OK!');
        console.log('firmware version: ' + fps.firmwareVersion);
        console.log('iso area max: ' + fps.isoAreaMaxSize);
        console.log('device serial number: ' + fps.deviceSerialNumber);
        fps.ledONOFF(1).then(function() {
            console.log('ledON: OK!');
        }, function(err) {
            console.log('ledON error: ' + fps.decodeError(err));
        });
        identify();
    },
    function(err) {
        console.log('init err: ' + fps.decodeError(err));
    }
);

function display_emit(type, id) {
    io.sockets.in(room).emit(type, id);
}

var room = 'room';
io.sockets.on('connection', function(socket) {
    socket.join(room);
    console.log('connected');
    socket.on('disconnect', function() {
        console.log('disconnected');
    });
});

server.listen(80);