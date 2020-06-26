const test = require('tape')
const sandboxWorker = require('..')

test('When end() cb is called, the worker has exited', t=>{
  t.plan(4)
  let onEnd_called

  const {addTask, end} = sandboxWorker(onEnd)

  function onEnd(err) {
    console.log('onEnd')
    t.true(err)
    onEnd_called = err
  }

  const task = addTask(`
    const c = 10
    module.exports = function ([a, b]) {
      return a + b + c
    }
  `)
  
  task('[5, 6]', (err, result) =>{
    t.error(err)
    t.equal(result, '21')
    end( err =>{
      console.log('end cb called')
      t.true(onEnd_called)
    })
  })
})

