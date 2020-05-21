const {isMainThread, Worker, parentPort, workerData} = require('worker_threads')
const debug = require('debug')('sandbox-worker')

if (!isMainThread) {
  const {engine, code} = workerData
  if (engine !== 'duktape' && engine !== 'quickjs') {
    throw Error('Engine must be duktape or quickjs')
  }
  const Engine = require('wasm-jseval')[`${engine}Eval`].getInstance
  const promisedEngine = Engine()

  function makeFunction(code, cb) {
    promisedEngine.then( engine => {
      const f = function(args) {
        return engine.rawEval(`(${code})(${args})`)
      }
      cb(null, f)
    }).catch( err =>{
      cb(err)
    })
  }

  makeFunction(code, (err, f) =>{
    if (err) throw err
    parentPort.on('message', ([verb, args]) => {
      if (verb == 'end') {
        return process.exit(0)
      }
      try {
        const result = f(args)
        console.log(`f result: ${result}`)
        parentPort.postMessage([null, result])
      } catch(err) {
        console.error(`error in f: ${err.message}`)
        parentPort.postMessage([err])
      }
    })
  })
} else {
  module.exports = function (code, opts, cb) {
    if (typeof opts == 'function') {
      cb = opts
      opts = {}
    }
    if (!opts) opts = {}
    const engine = opts.engine || 'quickjs'
    const worker = makeWorker(engine, code, onDone, onEnd)

    const pending = []

    function onDone(err, result) {
      pending.shift()(err, result)
    }

    function onEnd(err) {
      while(pending.length) onDone(err)
      if (err == true) {
        console.log('worker ended')
      } else {
        console.error(`worker ended, err: ${err.message}`)
      }
      cb(err)
    }

    function call(args, cb) {
      pending.push(cb)
      worker.postMessage(['call', args])
    }

    function end(cb) {
      pending.push(cb)
      worker.postMessage(['end'])
    }
    
    return {call, end}
  }

}

// -- util

function makeWorker(engine, code, onDone, onEnd) {
  const worker = new Worker(__filename, {
    workerData: {engine, code}
  })
  let _err = null
  worker.on('error', err =>{
    console.error(`worker error: ${err.message}`)
    _err = err
    onEnd(err)
  })
  worker.on('message', msg =>{
    const [err, result] = msg
    console.log(`err: ${err && err.message}, result: ${result}`)
    onDone(err, result)
  })
  worker.on('exit', code =>{
    if (_err) return
    console.log(`exit: ${code}`)
    onEnd(true, code)
  })
  return worker
}

