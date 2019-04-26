const amqp = require('amqplib')
const os   = require('os');

class AmqpRpcBase {

  constructor(options = {}) {
    let {connection, ...restOptions} = options
    this.options = {
      exchange: 'rpc_exchange',
      ...restOptions
    }
    if (connection) {
      this.noDisconnect = true
      this.connection = connection
    } else {
      this.connectionOptions = options.connectionOptions || 'amqp://guest:guest@localhost:5672'
      this.socketOptions = options.socketOptions || {}
    }
  }

  /**
   * Connect to amqp server if need
   * @returns {Promise<any> | * | void}
   */

  async connect() {
    if (this.connection) return this.connection
    return this.connection = await amqp.connect(this.connectionOptions, this.socketOptions)
  }

  /**
   * Disconnect to amqp server if need
   * @returns {Promise<any> | * | void}
   */

  async disconnect() {
    if (!this.noDisconnect && this.connection) {
      let connection = this.connection
      this.connection = null;
      return connection.close();
    }
  }

  generateQueueName(type) {
    return os.hostname() + ':pid' + process.pid + ':' + type;
  }

  /**
   * Return promise for channel create
   * @returns {*}
   */

  createChannel() {
    if(this.channel) return this.channel
    return this.channel = new Promise(async (resolve, reject) => {
      this.connect()
        .then( conn => conn.createChannel())
        .then(ch => this.channel = ch)
        .then(resolve)
        .catch(e => { this.channel = null; reject(e) })
    })
  }

  objectToBuffer(obj) {
    return Buffer.from(JSON.stringify(obj))
  }
}


module.exports = { AmqpRpcBase }