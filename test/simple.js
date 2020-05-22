const test = require('tape')
const sandboxWorker = require('..')

test('Can call function', t=>{
  t.plan(7)

  const {addTask, end} = sandboxWorker(onEnd)

  function onEnd(err) {
    t.true(err)
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

    task('[71, 6]', (err, result) => {
      t.error(err)
      t.equal(result, '87')

      task.remove( err=>{
        t.error(err, 'task remove')
        end( err=>{
          t.true(err)
        })
      })
    })
  })
})

test('function return value is JSON', t=>{
  t.plan(7)

  const {addTask, end} = sandboxWorker(onEnd)

  function onEnd(err) {
    t.true(err)
  }

  const task = addTask(`
    module.exports = function ([a, b]) {
      return {a, b}
    }
  `)
  
  task('[5, 6]', (err, result) =>{
    t.error(err)
    t.equal(result, JSON.stringify({a:5, b:6}))

    task('[71, 6]', (err, result) => {
      t.error(err)
      t.equal(result, JSON.stringify({a:71, b:6}))

      task.remove( err=>{
        t.error(err, 'task remove')
        end( err=>{
          t.true(err)
        })
      })
    })
  })
})


test('Syntax error in args are handled gracefully', t=>{
  t.plan(8)

  const {addTask, end} = sandboxWorker(onEnd)

  function onEnd(err) {
    t.true(err)
  }

  const task = addTask(`
    module.exports = function ([a, b]) {
      return a + b
    }
  `)
  
  task('[5, 6', (err, result) =>{
    t.ok(err)
    console.log(err.message)
    t.ok(err.message, 'should have error message')
    t.equal(result, undefined)

    task('[71, 6]', (err, result) => {
      t.error(err)
      t.equal(result, '77')

      task.remove( err=>{
        t.error(err, 'task remove')
        end( err=>{
          t.true(err)
        })
      })
    })
  })
})
