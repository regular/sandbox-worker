const fs = require('fs')
const {isMainThread, Worker, parentPort, workerData} = require('worker_threads')
const {join} = require('path')
const debug = require('debug')('sandbox:main')

module.exports = function (opts, cb) {
  if (typeof opts == 'function') {
    cb = opts
    opts = {}
  }
  if (!opts) opts = {}
  let ended = null
  const worker = makeWorker(opts, onDone, onEnd)

  const pending = []

  function onDone(err, result) {
    debug(`onDone ${err && err.message} ${result}`)
    pending.shift()(err, result)
  }

  function onEnd(err) {
    ended = err == true ? new Error('worker is no longer running') : new Error(`worker exited with error ${err.message}`)
    debug(`onEnd ${err}`)
    while(pending.length) onDone(err)
    if (err == true) {
      //console.log('worker ended')
    } else {
      console.error(`worker ended, err: ${JSON.stringify(err.message)}`)
    }
    cb(err)
  }

  function call(index, args, cb) {
    if (ended) return cb(ended)
    // the debug statement has been identified as responsile for a crash on shutdown
    debug(`sending call ${index}, args: ${args}`)
    pending.push(cb)
    worker.postMessage({verb: 'call', index, args})
  }

  function addTask(code, cb) {
    if (ended) return cb(ended)
    debug('sending addTask')
    pending.push(cb)
    worker.postMessage({verb: 'addTask', code})
  }

  function removeTask(index, cb) {
    if (ended) return cb(ended)
    debug(`sending removeTask ${index}`)
    pending.push(cb)
    worker.postMessage({verb: 'removeTask', index})
  }

  function end(cb) {
    if (ended) return cb(ended)
    debug('sending end')
    pending.push(cb)
    worker.postMessage({verb: 'end'})
  }
  
  return {
    end,
    addTask: function(code, cb) {
      let index
      const waiting = []
      const f = function(args, cb) {
        if (index == undefined) {
          return waiting.push([true, args, cb])
        }
        call(index, args, cb)
      }
      f.remove = function(cb) {
        if (index == undefined) {
          return waiting.push([false, null, cb])
        }
        removeTask(index, cb)
      }

      addTask(code, (err, _index) => {
        index = _index
        while(waiting.length) {
          const [c, args, _cb] = waiting.shift()
          if (err) {
            _cb(err)
          } else {
            if (c) {
              call(index, args, _cb)
            } else {
              removeTask(index, _cb)
            }
          }
        }
        if (err && cb) cb(err)
      })
      return f
    }
  }
}

// -- util

function makeWorker(opts, onDone, onEnd) {
  const code = fs.readFileSync(join(__dirname, '_thread_bundled.js'), 'utf8')
  const worker = new Worker(code, {
    workerData: {},
    eval: true
  })
  let _err = null
  worker.on('error', err =>{
    console.error(`worker error: ${err.message}`)
    console.error(`       stack: ${err.stack}`)
    _err = err
    onEnd(err)
  })
  worker.on('message', msg =>{
    const [err, result] = msg
    //console.log(`err: ${err && err.message}, result: ${result}`)
    onDone(err, result)
  })
  worker.on('exit', code =>{
    if (_err) return
    console.log(`exit: ${code}`)
    onEnd(true, code)
  })
  return worker
}

