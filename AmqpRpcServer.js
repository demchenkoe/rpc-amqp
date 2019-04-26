const debug = require('debug')('rpc-control:AmqpRpcServer')
const { AmqpRpcBase } = require('./AmqpRpcBase')
const { RemoteProcedureWorker } = require('../rpc-events/RemoteProcedureWorker')
const { ClassOf }   = require('./utils')
const { ERRORS }   = require('./errors')

class AmqpRpcServer extends AmqpRpcBase {
  /**
   * @param {Object} options
   * @param {String} options.exchange   name of exchange. Default is "rpc_exchange"
   * @param {String} options.serverCtrlQueue   name of control queue
   */
  constructor(options) {
    super(options)

    //Container for worker
    this.workers = {}
  }

  /**
   * Create queue for server control protocol events (CALL, CANCEL, PAUSE, PING and other events)
   * Single channel for one AmqpRpcControlProtocol instance.
   * @returns {*}
   */

  async createServerCtrlQueue() {
    if(this.serverCtrlQueue) return this.serverCtrlQueue
    let queueName = this.options.serverCtrlQueue || this.generateQueueName('ServerCtrlQueue')
    return this.serverCtrlQueue = new Promise(async (resolve, reject) => {
      this.createChannel()
        .then( async (ch) => {
          await ch.assertQueue(queueName, {durable: false})
          ch.consume(queueName, (msg) => this.onServerIncommingEvent(msg, ch))
          debug(`serverCtrlQueue: ${queueName}`)
          return this.serverCtrlQueue = queueName
        })
        .then(resolve)
        .catch(e => { this.serverCtrlQueue = null; reject(e) })
    })
  }

  /**
   * Handler for server incoming events
   * @param msg
   * @param ch
   */

  onServerIncommingEvent(msg, ch) {
    let content = JSON.parse(msg.content.toString())
    let baseCorrelationId = content['base-correlation-id']
    let handler = this.workers[baseCorrelationId]
    if(handler && typeof handler.onClientEvent === 'function') {
      handler.onClientEvent(content)
    }
  }

  /**
   * Add continuous command.
   * @param command
   * @param WorkerClass
   * @param options
   * @returns {Promise<void>}
   */

  async addContinuousTaskServer(command, WorkerClass, options = {}) {
    let ctrlQueueName = await this.createServerCtrlQueue()
    let ch = await this.createChannel()
    await ch.assertQueue(command, {durable: false})
    const consumerTag = await ch.consume(command, async (msg) => {

      let {replyTo, correlationId } = msg.properties

      if(this.workers[correlationId]) {
        //correlationId error
        this.sendErrorToClient({ clientControlQueue: replyTo, baseCorrelationId: correlationId }, ERRORS.NOT_UNIQUE_CORRELATION_ID)
        ch.ack(msg)
        return
      }

      let parsed = null
      let handler = this.workers[correlationId] = new WorkerClass({
        server: this,
        clientControlQueue: replyTo,
        baseCorrelationId: correlationId,
        command,
        ctrlQueueName,
        taskOptions: options.taskOptions,
      })
      try {
        parsed = await handler.parseIncommingMessage(msg.content, msg.properties.contentType)
      } catch(error) {
        this.sendErrorToClient(handler, ERRORS.CONTENT_PARSE_ERROR)
        ch.ack(msg)
        return
      }
      try {
        const payload = await handler.execute(parsed.content, parsed.contentType)

        this.sendEventToClient(handler, 'STARTED', {
          'handler-version': handler.version,
          'incomming-events': handler.incommingEvents,
          'outgoing-events': handler.outgoingEvents,
        }, payload)
        ch.ack(msg)
      } catch (error) {
        this.sendErrorToClient(handler, ERRORS.ERROR_ON_EXECUTE)
        ch.ack(msg)
        return
      }
    })
    return consumerTag
  }


  /**
   * Add new command handler
   * @param command
   * @param WorkerClass
   * @param options
   * @returns {Promise<void>}
   */

  async on(command, fn, options) {
    if(ClassOf(fn, RemoteProcedureWorker)) {
      return this.addContinuousTaskServer(command, fn, options)
    } else {
      let ch = await this.createChannel()
      let queueName = options.queueName || command
      await ch.assertQueue(queueName, {durable: false})
      const consumerTag = await ch.consume(queueName, async (msg) => {
        const result = await fn(msg)
        ch.sendToQueue(replyTo, result, {correlationId})
        ch.ack(msg)
      })
      return consumerTag
    }
  }

  async off(consumerTag) {
    let ch = await this.createChannel()
    return ch.cancel(consumerTag)
  }

  async sendEventToClient(continuousTask, event, protocolProperties, payload) {
    const ch = await this.createChannel()
    let serverControlQueue = await this.createServerCtrlQueue()
    return ch.sendToQueue(
      continuousTask.clientControlQueue,
      this.objectToBuffer({
        'base-correlation-id': continuousTask.baseCorrelationId,
        'server-control-queue': serverControlQueue,
        event, ...protocolProperties, payload
      }),
      {
        replyTo: serverControlQueue,
        correlationId: continuousTask.baseCorrelationId,
        contentType: 'application/rpc-control.v1+json'
      }
    )
  }

  sendErrorToClient(continuousTask, { code, message }, payload) {
    return this.sendEventToClient(continuousTask, 'ERROR', { code, message }, payload)
  }
}


module.exports = { AmqpRpcServer }