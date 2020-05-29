sandbox-worker
---

```
const SandboxWorker = require('sandbox-worker')

const {addTask, end} = SandboxWorker(onEnd)

function onEnd(err) {
  if (err == true) {
    console.error('worker ended normally')
  } else if (err) {
    console.error(`worker crashed: ${err.message}`)
  }
}

// pass code as a string
// it must be a commonJs module exporting a funtion with one parameter
const task = addTask(`
  const c = 10
  module.exports = function ([a, b]) {
    return a + b + c
  }
`)

// pass arguments as JSON strings
task('[5, 6]', (err, result) =>{
  console.log(result) // => '21'
  task.remove( err=>{
    // if you are done, call end()
    end( err=>{})
  })
})
```

### Why passing arguments as JSON strings?

The arguments have to be serialized to be sent to the worker. In cases where your input data already is JSON, we save a redundant JSON.stringify()/JSON.parse() rondtrip this way.

## API


### `SandboxWorker(onEnd)`

creates a new worker thread

- onEnd: a callback that is called when the worker exits. The callback is called with `true` when the thread ended normally, and with an `Error` object otherwise.

returns an object with two properte:
  - addTask: a function that lets you add a function to the worker
  - end: a function that allows you to explicitly end the worker's execution

### `addTask(code)`

Creates a new JS runtime and JS execution context and adds a task to the worker. You can add multiple tasks to the same worker. They will be isolated from each other and will be executed in sequence (not in parallel) when invoked.

- `code`: a commonJS module's source code.

The code must assign a function that takes one argument to `module.exports`. That function can be called by calling the return value of `addTask`.

returns: an async function taking one argument as a JSON string. The JSON string will be deserialized inside the worker and the task will be executed by calling `module.exports` with the deserialized JSON.

  - `task(argument, cb)`
    - `argument`: JSON string to be used as function argument
    - `cb`: errback, called with the result of the taks invokation

### `end(cb)`

ends the worker thread. 

See tests for details.

License: MIT
