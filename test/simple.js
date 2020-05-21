const test = require('tape')
const sandboxWorker = require('..')

test('Can call function', t=>{
  t.plan(6)

  const {call, end} = sandboxWorker(`
    function ([a, b]) {
      return a + b
    }
  `, onEnd)

  function onEnd(err) {
    t.true(err)
  }
  
  call('[5, 6]', (err, result) =>{
    t.error(err)
    t.equal(result, '11')
  })
  call('[71, 6]', (err, result) => {
    t.error(err)
    t.equal(result, '77')
  })
  end( err=>{
    t.true(err)
  })
})

test('function return value is JSON', t=>{
  t.plan(6)

  const {call, end} = sandboxWorker(`
    function ([a, b]) {
      return {a, b}
    }
  `, onEnd)

  function onEnd(err) {
    t.true(err)
  }
  
  call('[5, 6]', (err, result) =>{
    t.error(err)
    t.equal(result, JSON.stringify({a:5, b:6}))
  })
  call('[71, 4]', (err, result) => {
    t.error(err)
    t.equal(result, JSON.stringify({a:71, b:4}))
  })
  end( err=>{
    t.true(err)
  })
})


test('Syntax error in args are handled gracefully', t=>{
  t.plan(7)

  const {call, end} = sandboxWorker(`
    function ([a, b]) {
      return a + b
    }
  `, onEnd)

  function onEnd(err) {
    t.true(err)
  }
  
  call('[5, 6', (err, result) =>{
    t.ok(err)
    console.log(err.message)
    t.ok(err.message, 'should have error message')
    t.equal(result, undefined)
  })
  call('[71, 6]', (err, result) => {
    t.error(err)
    t.equal(result, '77')
  })
  end( err=>{
    t.true(err)
  })
})
