const uuid = require('node-uuid').v4;
const debug = require('debug')('rpc-control:AmqpRpcClient')
const { AmqpRpcBase } = require('./AmqpRpcBase')
const { RemoteProcedureCaller } = require('@goldix.org/rpc-events/RemoteProcedureCaller')

class AmqpRpcClient extends AmqpRpcBase {

  /**
   * @param {Object} options
   * @param {String} options.exchange   name of exchange. Default is "rpc_exchange"
   * @param {String} options.clientCtrlQueue   name of control queue
   * @param {Class}  options.RemoteProcedureCaller custom class of Caller
   */
  constructor(options) {
    super(options)
    if(!this.options.RemoteProcedureCaller) {
      this.options.RemoteProcedureCaller = RemoteProcedureCaller
    }

    this.calls = {}
  }

  /**
   * Create queue for client control protocol events (PROGRESS, ERROR, COMPLETED, PONG and other events)
   * Single channel for one AmqpRpcControlProtocol instance.
   * @returns {*}
   */

  async createClientCtrlQueue() {
    if(this.clientCtrlQueue) return this.clientCtrlQueue
    let queueName = this.options.clientCtrlQueue || this.generateQueueName('ClientCtrlQueue')
    return this.clientCtrlQueue = new Promise(async (resolve, reject) => {
      this.createChannel()
        .then( async (ch) => {
          await ch.assertQueue(queueName, {exclusive: true})
          let options = {noAck: true}
          ch.consume(queueName, (msg) => this.onClientIncommingEvent(msg, ch, options), options)
          return this.clientCtrlQueue = queueName
        })
        .then(resolve)
        .catch(e => { this.clientCtrlQueue = null; reject(e) })
    })
  }

  /**
   *
   * @param callInfo
   * @param msg
   * @returns {Promise<undefined|*>}
   */

  async onCallerIncommingMessage(callInfo, msg) {
    if(!msg.content.length) return
    let content = JSON.parse(msg.content)
    let { replyTo: serverControlQueue, correlationId: baseCorrelationId } = msg.properties

    if(!callInfo.rpcCaller) {
      if(content.event === 'ERROR') {
        return Promise.reject(content)
      }

      let { exchange, RemoteProcedureCaller, resolve, reject, ...taskOptions }  = {
        ...this.options,
        ...callInfo,
      }

      callInfo.rpcCaller = new RemoteProcedureCaller({
        serverControlQueue,
        baseCorrelationId,
        client: this,
        worker: {
          version: content.version,
          commands: content.commands,
          events: content.events,
        },
        taskOptions
      })
    }

    callInfo.rpcCaller.onServerEvent(content)
    
    if(content.finish === true) {
      delete this.calls[baseCorrelationId]
    }

    return callInfo.rpcCaller
  }

  /**
   * Handler for client incoming control messages
   * @param msg
   */

  async onClientIncommingEvent(msg, ch, options) {
    let { contentType, correlationId: baseCorrelationId } = msg.properties

    let callInfo = this.calls[baseCorrelationId]
    if(!callInfo) {
      debug(`Unknown base correlation ID ${baseCorrelationId}`)
      options.noAck || ch.ack(msg)
      return
    }
    delete callInfo.expired
    delete callInfo.timeout
    delete callInfo.start

    let response = null
    try {
      if (contentType === 'application/rpc-control.v1+json') {
        response = await this.onCallerIncommingMessage(callInfo, msg)
      } else {
        response = {content: msg.content, contentType: msg.properties.contentType}
        delete this.calls[baseCorrelationId]
      }
    } catch(error) {
      if(callInfo.reject) callInfo.reject(error)
      delete callInfo.reject
      delete callInfo.resolve
    }

    if (callInfo.resolve) {
      callInfo.resolve(response)
      delete callInfo.reject
      delete callInfo.resolve
    }

    options.noAck || ch.ack(msg)
  }

  /**
   * Execute remote procedure
   * @param command
   * @param content
   * @param contentType
   * @returns {Promise<*>}
   */

  async execute(command, content = '', { timeout = 60000, contentType = 'application/json', ...options } = {}) {
    let correlationId = uuid()
    let replyTo = await this.createClientCtrlQueue()
    let ch = await this.createChannel()

    if(!(content instanceof Buffer)) {
      if(typeof content === 'object' && contentType === 'application/json') {
        content = JSON.stringify(content)
      }
      if(typeof content === 'string') {
        content = Buffer.from(content)
      }
    }

    return new Promise(async (resolve, reject) => {

      this.calls[correlationId] = {
        resolve,
        reject,
        start: Date.now(),
        timeout,
        expired: timeout ? Date.now() + timeout : null,
        ...options
      }

      await ch.sendToQueue(command, content, {
        correlationId,
        replyTo,
        contentType
      });
    })
  }

  /**
   *
   * @param caller
   * @param event
   * @param protocolProperties
   * @param payload
   * @returns {Promise<*>}
   */

  async sendEventToServer(caller, event, protocolProperties, payload) {
    const ch = await this.createChannel()
    let clientControlQueue = await this.createClientCtrlQueue()
    return ch.sendToQueue(
      caller.serverControlQueue,
      this.objectToBuffer({
        "base-correlation-id": caller.baseCorrelationId,
        'client-control-queue': clientControlQueue,
        event, ...protocolProperties, payload
      }),
      {
        replyTo: clientControlQueue,
        correlationId: caller.baseCorrelationId,
        contentType: 'application/rpc-control.v1+json'
      }
    )
  }
}


module.exports = { AmqpRpcClient }