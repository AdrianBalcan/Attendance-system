var express = require('express');
var app = express();
var server = require('http').Server(app);
var io = require('socket.io')(server);
var GT511C3 = require('gt511c3');
var async = require('async');
var fs = require('fs');
var Promise = require("promise");
var pg = require('pg');

var config = {
    user: 'attendance', //env var: PGUSER
    database: 'attendance_dev', //env var: PGDATABASE
    password: 'attzog', //env var: PGPASSWORD
    host: 'pontaj02.zog.ro', // Server hosting the postgres database
    port: 5432, //env var: PGPORT
    max: 10, // max number of clients in the pool
    idleTimeoutMillis: 30000, // how long a client is allowed to remain idle before being closed
};

var pool = new pg.Pool(config);

function db() {
    console.log('db');
    pool.connect(function(err, client, done) {
        console.log('db1');
        if (err) {
            return console.error('error fetching client from pool', err);
        }
        client.query('SELECT * from employees', function(err, result) {
            //call `done()` to release the client back to the pool
            done();

            if (err) {
                return console.error('error running query', err);
            }
            console.log(result.rows[0].number);
            //output: 1
        });
    });

    pool.on('error', function(err, client) {
        // if an error is encountered by a client while it sits idle in the pool
        // the pool itself will emit an error event with both the error and
        // the client which emitted the original error
        // this is a rare occurrence but can happen if there is a network partition
        // between your application and the database, the database restarts, etc.
        // and so you might want to handle it and at least log it out
        console.error('idle client error', err.message, err.stack)
    });
}

var TEMPLATE = new Buffer(498);
var enrollID = 0;
var enrollName = 0;

app.use(express.static(__dirname + '/public'));

app.get('/test', function(req, res) {
    res.sendFile(__dirname + '/views/index.html');
});
app.get('/db', function(req, res) {
    db();
});

app.post('/enroll/:id/:name', function(req, res) {
    if (!isNaN(req.params.id)) {
        enroll = 1;
        enrollID = req.params.id;
        enrollName = req.params.name;
        res.send('ok');
        console.log(enroll);
    } else {
        console.log('Error! ID param is not a number');
        console.log(req.params.id);
        res.send('Error!');
    }
});

var fps = new GT511C3('/dev/ttyS0', {
    baudrate: 115200
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

var enroll = 0;

function identifyt() {
    if (enroll == 0) {
        console.log('idt');
        waitFinger().then(function() {
            fps.captureFinger(0)
                .then(function() {
                    return fps.identify();
                })
                .then(function(ID) {
                    io.sockets.in(room).emit('identify-ok', ID);
                    release().then(function() {
                        identifyt()
                    });
                }, function(err) {
                    if (err == 4104) {
                        io.sockets.in(room).emit('identify-err');
                        release().then(function() {
                            identifyt()
                        });
                    } else {
                        identifyt();
                    }
                });
        });
    }
}

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
                    }, 50);
                }
            });
    } else {
        enroll_identify();
    }
}

function enroll_identify() {
    io.sockets.in(room).emit('enroll', {
        enrollStep: enroll,
        enrollName: enrollName
    });
    if (enroll == 1) {
        fps.captureFinger(0)
            .then(function() {
                return fps.identify();
            })
            .then(function(ID) {
                io.sockets.in(room).emit('enroll-err', {
                    enrollStep: enroll,
                    enrollName: enrollName
                });
                release().then(function() {
                    enroll_identify();
                });
            }, function(err) {
                if (err == 4104) {
                    io.sockets.in(room).emit('enroll-ok', {
                        enrollStep: enroll,
                        enrollName: enrollName
                    });
                    release().then(function(){
                        deleteEnroll();
                    });
                } else {
                    setTimeout(function() {
                        enroll_identify();
                    }, 100);
                }
            });
    }
}

function deleteEnroll() {
    fps.deleteID(enrollID).then(function() {
        console.log('deleteID: ' + enrollID + ' deleted!');
        startEnroll();
    }, function(err) {
        console.log('deleteID err: ' + fps.decodeError(err));
        startEnroll();
    });
}

function startEnroll() {
    setTimeout(function() {
        fps.enrollStart(enrollID).then(function() {
            console.log('enrollStart: ' + enrollID + ' enroll started!');
            enroll = 2;
            enroll1();
        }, function(err) {
            console.log('enrollStart error: ' + fps.decodeError(err));
            io.sockets.in(room).emit('enroll-err', {
                enrollStep: enroll,
                enrollName: enrollName
            });
	    enroll = 0;
            identify();
        });
    }, 1000);
}

function enroll1() {
    io.sockets.in(room).emit('enroll', {
        enrollStep: enroll,
        enrollName: enrollName
    });
    fps.captureFinger().then(function() {
        fps.enroll1().then(function() {
	    console.log('enroll 1 ok');
            io.sockets.in(room).emit('enroll-ok', {
                enrollStep: enroll,
                enrollName: enrollName
            });
            release().then(function(){
                enroll = 3;
                enroll2()
            });
        }, function(err) {
            console.log('enroll1 error: ' + fps.decodeError(err));
            io.sockets.in(room).emit('enroll-err', {
                enrollStep: enroll,
                enrollName: enrollName
            });
	    release().then(function() {
                enroll1();
            });
        });
    }, function(err) {
        setTimeout(function() {
            enroll1();
        }, 100);

    });
}

function enroll2() {
    io.sockets.in(room).emit('enroll', {
        enrollStep: enroll,
        enrollName: enrollName
    });
    fps.captureFinger().then(function() {
        console.log('captureFinger: OK!');
        fps.enroll2().then(function() {
            console.log('enroll 2 ok');
            io.sockets.in(room).emit('enroll-ok', {
                enrollStep: enroll,
                enrollName: enrollName
            });
	    release().then(function() {
                enroll = 4;
                enroll3();
            });
        }, function(err) {
            console.log('enroll2 error: ' + fps.decodeError(err));
            io.sockets.in(room).emit('enroll-err', {
                enrollStep: enroll,
                enrollName: enrollName
            });
	    release().then(function (){
                enroll2();
            });
        });
    }, function(err) {
        setTimeout(function() {
            enroll2();
            console.log('captureFinger err: ' + fps.decodeError(err));
        }, 100);
    });
}

function enroll3() {
    io.sockets.in(room).emit('enroll', {
        enrollStep: enroll,
        enrollName: enrollName
    });
    fps.captureFinger().then(function() {
        fps.enroll3().then(function() {
            console.log('enroll 3 ok');
            io.sockets.in(room).emit('enroll-ok', {
                enrollStep: enroll,
                enrollName: enrollName
            });
	    release().then(function() {
                enroll = 0;
                identify();
            });
        }, function(err) {
            console.log('enroll3 error: ' + fps.decodeError(err));
            io.sockets.in(room).emit('enroll-err', {
                enrollStep: enroll,
                enrollName: enrollName
            });
	    release().then(function (){
		enroll = 0;
                identify();
            });
        });
    }, function(err) {
        setTimeout(function() {
            enroll3();
        }, 100);
    });
}

function saveTemplate(ID) {
    fps.getTemplate(ID).then(
        function(template) {
            TEMPLATE = new Buffer(template);
            console.log('getTemplate: ID = ' + ID + ' [' + template.length + '] ' + (new Buffer(template)).toString('hex'));
            var templateFile = TEMPLATE_PATH + '/template_' + ID_TO_USE + '.tpl';
            fs.writeFile(templateFile, template, 'binary', function(err) {
                if (err) {
                    console.log('getTemplate err: ' + fps.decodeError(err));
                } else {
                    console.log('getTemplate: template saved! [' + templateFile + ']');
                }
            });
        },
        function(err) {
            console.log('getTemplate err: ' + fps.decodeError(err));
        }
    );
}

function waitFinger() {
    return (new Promise(function(resolve, reject) {
        var check = function() {
            fps.isPressFinger().then(function() {
                console.log('waitFinger ok');
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
