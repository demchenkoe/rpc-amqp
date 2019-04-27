const { AmqpRpcClient } = require('../AmqpRpcClient')

const rpc = new AmqpRpcClient()

async function run() {

  //This variant not support with autoRecovery option

  try {
    let content = {counterMax: 10}
    let options = {
      onProgress: (state) => {
        console.log('onProgress', state)
      },
      onCompleted: (state) => {
        console.log('onCompleted', state)
      },
      onCanceled: (state) => {
        console.log('onCanceled', state)
      },
    }

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