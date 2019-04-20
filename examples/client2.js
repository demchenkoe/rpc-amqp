const { AmqpRpcClient } = require('../AmqpRpcClient')
const { RemoteProcedureCaller } = require('@goldix.org/rpc-events')

//Define new custom caller

class CounterCaller extends RemoteProcedureCaller {

  onServerEventProgress (eventPacket) {
    console.log('onProgress', eventPacket)
  }
  onServerEventCompleted(eventPacket) {
    console.log('onCompleted', eventPacket)
  }
  onServerEventCanceled (eventPacket) {
    console.log('onCanceled', eventPacket)
  }
}

const rpc = new AmqpRpcClient({
  //RemoteProcedureCaller: CounterCaller //you can setup your custom caller for all rpc.execute()
})

async function run() {
  try {
    let content = {counterMax: 10}
    let options = { RemoteProcedureCaller: CounterCaller }
    let remoteTask = await rpc.execute('counter', content, options)

    remoteTask.sendEventToServer('PING')

    setTimeout(() => {
      remoteTask.sendEventToServer('CANCEL')
    }, 5000)

  } catch(error) {
    console.error(error)
  }
}

run()