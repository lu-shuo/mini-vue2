function isObject(object) {
  return object !== null && typeof object === 'object'
}

function hasOwn(obj, key) {
  return Object.prototype.hasOwnProperty.call(obj, key)
}
/**
 * @description: Object.defineProperty添加对象键值对
 * @param {Object} obj
 * @param {*} key
 * @param {*} value
 * @param {Boolean} enumerable
 * @return {*}
 */
function def(obj, key, value, enumerable) {
  Object.defineProperty(obj, key, {
    value,
    writable: true,
    configurable: true,
    enumerable: !!enumerable
  })
}
/**
 * @description: 删除数组中的某一项
 * @param {Array} arr
 * @param {*} item
 * @return {*}
 */
function remove(arr, item) {
  if (arr.length) {
    const index = arr.indexOf(item)
    if (index !== -1) {
      return arr.splice(index, 1)
    }
  }
}

/**
 * Parse simple path.
 * 把一个形如'data.a.b.c'的字符串路径所表示的值，从真实的data对象中取出来
 * 例如：
 * data = {a:{b:{c:2}}}
 * parsePath('a.b.c')(data)  // 2
 */
const bailRE = /[^\w.$]/
function parsePath(path) {
  if (bailRE.test(path)) {
    return
  }
  const segments = path.split('.')
  return function (obj) {
    for (let i = 0; i < segments.length; i++) {
      if (!obj) return
      obj = obj[segments[i]]
    }
    return obj
  }
}

// *Array响应式
const arrayProto = Array.prototype
// 创建一个对象作为拦截器
const arrayMethods = Object.create(arrayProto)

const methodsToPatch = [
  'push',
  'pop',
  'shift',
  'unshift',
  'splice',
  'sort',
  'reverse'
]

methodsToPatch.forEach(function (method) {
  const original = arrayMethods[method]
  Object.defineProperty(arrayMethods, method, {
    enumerable: false,
    configurable: true,
    writable: true,
    value: function mutator(...args) {
      const result = original.apply(this, args)
      return result
    }
  })
})


// *将拦截器挂载到实例与Array.prototype之间让之生效
// 能力检测：判断__proto__是否可用，因为有的浏览器不支持该属性
const hasProto = '__proto__' in {}

/**
 * @description: 通过__proto__拦截增强对象的原型
 * @param {Object} target
 * @param {Object} src
 * @param {Array} keys
 * @return {*}
 */
function protoAugment(target, src) {
  target.__proto__ = src
}
/**
 * @description: 在不支持原型的浏览器中，通过定义不可枚举的方法增强原型
 * @param {Object} target
 * @param {Object} src
 * @param {Array} keys
 * @return {*}
 */
function copyAugment(target, src, keys) {
  for (let i = 0, l = keys.length; i < l; i++) {
    const key = keys[i]
    def(target, key, src[key])
  }
}
// Object.getOwnPropertyNames()方法返回一个由指定对象的所有自身属性的属性名（包括不可枚举属性但不包括Symbol值作为名称的属性）组成的数组。
const arrayKeys = Object.getOwnPropertyNames(arrayMethods)

// *1.Observer类：通过递归的方式把一个对象的所有属性都转化成可观测对象
class Observer {
  constructor(value) {
    this.value = value

    this.dep = new Dep()    // *实例化一个依赖管理器，用来收集数组依赖

    def(value, '__ob__', this) // __ob__不可枚举，__ob__.value循环引用自身

    if (Array.isArray(value)) {
      const augment = hasProto
        ? protoAugment
        : copyAugment
      augment(value, arrayMethods, arrayKeys)
    } else {
      this.walk(value)
    }

  }

  walk(obj) {
    const keys = Object.keys(obj)
    for (let i = 0; i < keys.length; i++) {
      defineReactive(obj, keys[i])
    }
  }
}

function defineReactive(obj, key, val) {
  const dep = new Dep()

  if (arguments.length === 2) {
    val = obj[key]
  }
  // 递归调用
  if (typeof val === 'object') {
    new Observer(val)
  }

  Object.defineProperty(obj, key, {
    enumerable: true,
    configurable: true,
    get() {
      console.log(`属性${key}被读取了`)
      dep.depend() // 收集依赖
      return val
    },
    set(newVal) {
      if (val === newVal) return
      console.log(`属性${key}被赋值：${newVal}`)
      val = newVal
      dep.notify() // 通知依赖更新
    }
  })
}

// *2.Dep类：依赖收集器
// *管理每个数据的依赖集合，谁用到此数据就收集，数据变化时通知更新(在getter中收集依赖，在setter中通知依赖更新)
// *依赖到底是代码中的谁？答：watcher实例
class Dep {
  constructor() {
    this.subs = []
  }

  addSub(sub) {
    this.subs.push(sub)
  }

  // 添加一个依赖
  depend() {
    if (window.target) {
      this.addSub(window.target)
    }
  }

  // 删除一个依赖
  removeSub(sub) {
    remove(this.subs, sub)
  }

  // 通知所有依赖更新
  notify() {
    const subs = this.subs.slice() // !为啥复制一份?
    for (let i = 0, l = subs.length; i < l; i++) {
      subs[i].update()
    }
  }
}

// *3.Watcher类：
// *谁用到了数据，谁就是依赖，我们就为谁创建一个Watcher实例。
// *在创建Watcher实例的过程中会自动的把自己添加到这个数据对应的依赖管理器中，以后这个Watcher实例就代表这个依赖。
// ?如何将自身添加到对应的依赖管理器？见代码注释
// *在之后数据变化时，我们不直接去通知依赖更新，而是通知依赖对应的Watch实例，由Watcher实例去通知真正的依赖。
class Watcher {
  constructor(vm, expOrFn, cb) {
    this.vm = vm // *保存vue实例
    this.cb = cb // *更新回调（执行视图更新等）
    this.getter = parsePath(expOrFn)
    this.value = this.get() // *执行构造函数时执行get实例方法
  }

  get() {
    window.target = this // *将实例自身赋值到全局唯一对象window.target
    const vm = this.vm
    const value = this.getter.call(vm, vm) // *获取一次被依赖的数据，触发数据的getter，在getter中触发dep的依赖收集
    window.target = undefined // *释放window.target
    return value
  }

  update() { // *数据变化时，会触发setter，setter中触发dep.notify() ，遍历dep中的sub即watcher实例，执行watcher的update方法，在update()方法中调用数据变化的更新回调函数，从而更新视图。
    const oldValue = this.value
    this.value = this.get()
    this.cb.call(vm, this.value, oldValue)
  }
}
