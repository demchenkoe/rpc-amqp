const { AmqpRpcServer } = require('../AmqpRpcServer')
const { RemoteProcedureWorker } = require('@goldix.org/rpc-events/RemoteProcedureWorker')


//Define worker

class CounterWorker extends RemoteProcedureWorker {

  execute(params, contentType) {
    let counter = 0
    let counterMax = params.counterMax || Math.floor(Math.random()*1000)

    const next = () => {
      counter++
      this.state.completed_percent = (counterMax ? counter * 100 / counterMax : 0).toFixed(2)

      if(this.state.status === 'canceled') {
        this.sendEventCanceled()
        clearInterval(timer)
      } else if(counter >= counterMax) {
         this.sendEventCompleted()
        clearInterval(timer)
      } else {
        this.sendEventProgress()
      }
    }

    let timer = setInterval(next, 3000)
  }
}

//Run RPC server

const rpc = new AmqpRpcServer()
rpc.on('counter', CounterWorker)