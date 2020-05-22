const {isMainThread, Worker, parentPort, workerData} = require('worker_threads')
const debug = require('debug')('sandbox-worker')

if (!isMainThread) {
  const {code} = workerData

  const promisedEngine = require('quickjs-emscripten').getQuickJS()
  let vm

  function deinit() {
    if (vm) vm.dispose()
    vm = null
  }

  function init(code, cb) {
    promisedEngine.then( qjs => {
      vm = qjs.createVm()
      const result = vm.evalCode(`module = {}; ${code}`)
      if (result.error) {
        const e = new Error(vm.dump(result.error))
        result.error.dispose()
        return cb(e)
      }
      result.value.dispose()

      const f = function(args) {
        const result = vm.evalCode(`module.exports(${args})`)
        // unwrapResult will through a string otherwise
        /*
        if (result.error) {
          const s = vm.dump(result.error)
          console.error(`[${typeof s}] ${JSON.stringify(s)}`)
          if (typeof s == 'string') {
            result.error.dispose()
            throw new Error(s)
          }
        }
        */ 
        const value = vm.unwrapResult(result)
        const s = toJSON(vm, value)
        value.dispose()
        return s
      }
      cb(null, f)
    }).catch( err =>{
      cb(err)
    })
  }

  init(code, (err, f) =>{
    if (err) throw err
    parentPort.on('message', ([verb, args]) => {
      if (verb == 'end') {
        deinit()
        return process.exit(0)
      }
      try {
        const result = f(args)
        console.log(`f result: ${result}, [${typeof result}]`)
        parentPort.postMessage([null, result])
      } catch(err) {
        console.error(`error in f: ${err.message}`)
        parentPort.postMessage([{name: err.name, message: err.message}])
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

function toJSON(vm, handle) {
  return vm.ffi.QTS_Dump(vm.ctx.value, handle.value) 
}

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

