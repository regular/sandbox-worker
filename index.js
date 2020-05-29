const {isMainThread, Worker, parentPort, workerData} = require('worker_threads')

if (!isMainThread) {
  //const {code} = workerData
  const debug = require('debug')('sandbox:worker')

  const promisedEngine = require('quickjs-emscripten').getQuickJS()

  function removeTask(task) {
    debug('removing Task')
    if (task.vm) task.vm.dispose()
    task.vm = null
  }

  function init(cb) {
    debug('starting quickjs ...')
    promisedEngine.then( qjs => {
      debug('done!')
      const addTask = function(code) {
        debug('adding task ..')
        //console.log('adding Task', code)
        let vm = qjs.createVm()
        const result = vm.evalCode(`const module = {}; ${code}`)
        if (result.error) {
          const e = vm.dump(result.error)
          debug(`Failed: ${e.message}`)
          result.error.dispose()
          vm.dispose()
          throw e
        }
        result.value.dispose()
        debug('success')

        const f = function(args) {
          debug(`task called with args: "${args}"`)
          const result = vm.evalCode(`module.exports(${args})`)
          const value = vm.unwrapResult(result)
          debug('success')
          const s = toJSON(vm, value)
          value.dispose()
          return s
        }
        f.vm = vm
        return f
      }
      cb(null, addTask)
    }).catch( err=>cb(err) )
  }

  init((err, addTask) =>{
    if (err) {
      debug(`init failed: ${err.message}`)
      throw err
    }
    
    const tasks = []

    parentPort.on('message', msg => {
      const {verb} = msg
      debug(`${verb == "addTask"}`)
      debug(`received verb "${verb}"`)
      if (verb == 'end') {
        debug('received end')
        while(tasks.length) {
          const task = tasks.shift()
          if (task) removeTask(task)
        }
        return process.exit(0)
      } else if (verb == 'addTask') {
        debug('received addTask')
        const task = addTask(msg.code)
        tasks.push(task)
        parentPort.postMessage([null, tasks.length - 1])
        return
      } else if (verb == 'removeTask') {
        debug(`received removeTask ${msg.index}`)
        const task = tasks[msg.index]
        if (task) {
          removeTask(task)
          tasks[msg.index] = null
        }
        parentPort.postMessage([task ? null : new Error(`Invalid task index ${index}`)])
        return
      } else if (verb == 'call') {
        debug(`received call ${msg.index}`)
        try {
          const task = tasks[msg.index]
          if (!task) throw new Error(`invalid task index ${msg.index}`)
          const result = task(msg.args || '[]')
          //console.log(`task result: ${result}, [${typeof result}]`)
          parentPort.postMessage([null, result])
        } catch(err) {
          //console.error(`error in f: ${err.message}`)
          parentPort.postMessage([{name: err.name, message: err.message}])
        }
      }
    })
  })
  return
} 

const debug = require('debug')('sandbox:main')
module.exports = function (opts, cb) {
  if (typeof opts == 'function') {
    cb = opts
    opts = {}
  }
  if (!opts) opts = {}
  const worker = makeWorker(opts, onDone, onEnd)

  const pending = []

  function onDone(err, result) {
    debug(`onDone ${err && err.message} ${result}`)
    pending.shift()(err, result)
  }

  function onEnd(err) {
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
    debug(`sending call ${index}, args: ${args}`)
    pending.push(cb)
    worker.postMessage({verb: 'call', index, args})
  }

  function addTask(code, cb) {
    debug('sending addTask')
    pending.push(cb)
    worker.postMessage({verb: 'addTask', code})
  }

  function removeTask(index, cb) {
    debug(`sending removeTask ${index}`)
    pending.push(cb)
    worker.postMessage({verb: 'removeTask', index})
  }

  function end(cb) {
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

function toJSON(vm, handle) {
  return vm.ffi.QTS_Dump(vm.ctx.value, handle.value) 
}

function makeWorker(opts, onDone, onEnd) {
  const worker = new Worker(__filename, {
    workerData: {}
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

