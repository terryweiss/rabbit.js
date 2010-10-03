var amqp = require('./node-amqp/');
var sys = require('sys');

var connection = amqp.createConnection({'host': '127.0.0.1', 'port': 5672});

function pubSocket(client, exchangeName) {
    sys.debug('pub socket opened');
    var exchange = (exchangeName == '') ?
        connection.exchange('amq.fanout') :
        connection.exchange(exchangeName,
                            {'passive': true});
    client.on('message', function(msg) {
        sys.debug('pub message: ' + msg);
        exchange.publish('', msg);
    });
}

function subSocket(client, exchangeName) {
    sys.debug('sub socket opened');
    var exchange = (exchangeName == '') ?
        'amq.fanout' : exchangeName;
    var queue = connection.queue('');
    queue.subscribe(function(message) {
        sys.debug('sub message: ' + sys.inspect(message));
        client.send(message.data);
    });
    queue.bind(exchange, '');
}

function pushSocket(client, queueName) {
    sys.debug('push socket opened');
    if (queueName == '') {
        client.send("Must send address for push");
        client.end();
        return;
    }
    var queue = connection.queue(queueName, {'autoDelete': false,
                                             'durable': true,
                                             'exclusive': false});
    var exchange = connection.exchange('');
    client.on('message', function(msg) {
        sys.debug('push message: ' + msg);
        exchange.publish(queueName, msg);
    });
}

function pullSocket(client, queueName) {
    sys.debug('pull socket opened');
    if (queueName == '') {
        client.send("Must send address for pull");
        client.end();
        return;
    }
    var queue = connection.queue(queueName, {'autoDelete': false,
                                             'durable': true,
                                             'exclusive': false});
    queue.subscribe(function(message) {
        sys.debug('pull message: ' + sys.inspect(message));
        client.send(message.data);
    });
}

function reqSocket(client, queueName) {
    sys.debug("req socket opened");
    if (queueName == '') {
        client.send("Must send address for req");
        client.end();
        return;
    }
    var replyQueue = connection.queue('', {'exclusive': true,
                                           'autoDelete': true,
                                           'durable': false});
    var requestQueue = connection.queue(queueName, {'durable': true,
                                                    'autoDelete': false});
    replyQueue.subscribe(function(message) {
        client.send(message.data);
    });
    client.on('message', function(message) {
        connection.publish(queueName, message,
                           {'replyTo': replyQueue.name});
    });
}

function repSocket(client, queueName) {
    sys.debug("rep socket opened");
    if (queueName == '') {
        client.send("Must send address for req");
        client.end();
        return;
    }
    var queue = connection.queue(queueName, {'durable': true,
                                             'autoDelete': false});
    var replyTo = '';
    client.on('message', function (message) {
        sys.debug("Replying to: " + replyTo);
        connection.publish(replyTo, message);
    });
    queue.subscribe(function(message) {
        console.log(sys.inspect(message, null));
        replyTo = message._properties.replyTo;
        sys.debug("Set reply to: " + replyTo);
        client.send(message.data);
    });
}

function listen(server) {
    server.on('connection', function (client) {
        function dispatch(msg) {
            client.removeListener('message', dispatch);
            msg = msg.toString();
            var i = msg.indexOf(' ');
            var type = (i > -1) ? msg.substring(0, i) : msg;
            var addr = (i > -1) ? msg.substr(i+1) : '';
            sys.debug('type: ' + type);
            switch (type) {
            case 'pub':
                pubSocket(client, addr)
                break;;
            case 'sub':
                subSocket(client, addr);
                break;
            case 'push':
                pushSocket(client, addr);
                break;
            case 'pull':
                pullSocket(client, addr);
                break;
            case 'req':
                reqSocket(client, addr);
                break;
            case 'rep':
                repSocket(client, addr);
                break;
            default:
                client.send("Unknown socket type");
                client.end();
                sys.debug("Unknown socket type in: " + msg);
            }
        }
        
        client.on('message', dispatch);
    });
}

exports.listen = listen;