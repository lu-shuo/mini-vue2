// &1. Utils

// 能力检测：判断__proto__是否可用，因为有的浏览器不支持该属性
const hasProto = '__proto__' in {}

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

// &2. 变化侦测
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
      // *获取ob实例
      const ob = this.__ob__
      // *数组新增数据监测
      let inserted
      switch (method) {
        case 'push':
        case 'unshift':
          inserted = args
          break
        case 'splice':
          inserted = args.slice(2) // 如果是splice方法，那么传入参数列表中下标为2的就是新增的元素
          break
      }
      if (inserted) ob.observeArray(inserted)
      // *触发更新
      ob.dep.notify()
      return result
    }
  })
})

// *将拦截器挂载到实例与Array.prototype之间让之生效
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

    this.dep = new Dep()    // *实例化一个依赖管理器，收集数组依赖

    def(value, '__ob__', this) // __ob__不可枚举，__ob__.value循环引用自身

    if (Array.isArray(value)) {
      const augment = hasProto
        ? protoAugment
        : copyAugment
      augment(value, arrayMethods, arrayKeys)
      // *数组的深度监测（数组中包含对象）
      this.observeArray(value)
    } else {
      this.walk(value)
    }

  }

  observeArray(arr) {
    for (let i = 0, l = arr.length; i < l; i++) {
      observe(arr[i])
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
  const dep = new Dep() // *实例化一个依赖管理器，收集对象依赖

  if (arguments.length === 2) {
    val = obj[key]
  }

  // 对象或者数组都会返回childOb
  const childOb = observe(val)

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
      if (childOb) {
        childOb.dep.depend()
      }
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
/**
 * @description: 尝试为一个对象创建一个Observer实例并返回，如果value已经有__ob__属性，则直接返回
 * @param {Object} value
 * @return {*}
 */
function observe(value) {
  if (!isObject(value) || value instanceof VNode) {
    return
  }
  let ob
  if (hasOwn(value, '__ob__') && value.__ob__ instanceof Observer) {
    ob = value.__ob__
  } else {
    ob = new Observer(value)
  }
  return ob
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
    const subs = this.subs.slice()
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

// &3. VDOM
// 源码位置：src/core/vdom/vnode.js
class VNode {
  constructor(
    tag, // String
    data, // VnodeData
    children, // Array<Vnode>
    text, // String
    elm, // Node
    context, // Component
    componentOptions, // VNodeComponentOptions
    asyncFactory // Function
  ) {
    this.tag = tag /*当前节点的标签名*/
    this.data = data /*当前节点对应的对象，包含了具体的一些数据信息，是一个VNodeData类型，可以参考VNodeData类型中的数据信息*/
    this.children = children /*当前节点的子节点，是一个数组*/
    this.text = text /*当前节点的文本*/
    this.elm = elm /*当前虚拟节点对应的真实dom节点*/
    this.ns = undefined /*当前节点的名字空间*/
    this.context = context /*当前组件节点对应的Vue实例*/
    this.fnContext = undefined /*函数式组件对应的Vue实例*/
    this.fnOptions = undefined
    this.fnScopeId = undefined
    this.key = data && data.key /*节点的key属性，被当作节点的标志，用以优化*/
    this.componentOptions = componentOptions /*组件的option选项*/
    this.componentInstance = undefined /*当前节点对应的组件的实例*/
    this.parent = undefined /*当前节点的父节点*/
    this.raw = false /*简而言之就是是否为原生HTML或只是普通文本，innerHTML的时候为true，textContent的时候为false*/
    this.isStatic = false /*静态节点标志*/
    this.isRootInsert = true /*是否作为跟节点插入*/
    this.isComment = false /*是否为注释节点*/
    this.isCloned = false /*是否为克隆节点*/
    this.isOnce = false /*是否有v-once指令*/
    this.asyncFactory = asyncFactory
    this.asyncMeta = undefined
    this.isAsyncPlaceholder = false
  }
}

// *Vue中Vnode类可描述的真实节点类型：
// 注释节点
// 文本节点
// 元素节点
// 组件节点
// 函数式组件节点
// 克隆节点

// *创建注释节点
function createEmptyVNode(text) {
  const node = new VNode()
  node.text = text
  node.isComment = true
  return node
}

// *创建文本节点
function createTextVNode(val) {
  return new VNode(undefined, undefined, undefined, String(val))
}

// *创建克隆节点(按照已有节点的属性复制一份新的节点，唯一的区别是新节点isCloned为true)
// 模板编译优化时使用
function cloneVNode(vnode) {
  const cloned = new VNode(
    vnode.tag,
    vnode.data,
    vnode.children,
    vnode.text,
    vnode.elm,
    vnode.context,
    vnode.componentOptions,
    vnode.asyncFactory
  )
  cloned.ns = vnode.ns
  cloned.isStatic = vnode.isStatic
  cloned.key = vnode.key
  cloned.isComment = vnode.isComment
  cloned.fnContext = vnode.fnContext
  cloned.fnOptions = vnode.fnOptions
  cloned.fnScopeId = vnode.fnScopeId
  cloned.asyncMeta = vnode.asyncMeta
  cloned.isCloned = true
  return cloned
}
