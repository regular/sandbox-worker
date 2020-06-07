const {isMainThread, Worker, parentPort, workerData} = require('worker_threads')
const debug = require('debug')('sandbox:worker')
const promisedEngine = require('quickjs-emscripten').getQuickJS()

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

function toJSON(vm, handle) {
  return vm.ffi.QTS_Dump(vm.ctx.value, handle.value) 
}
