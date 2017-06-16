function DataTransfer() {
  let dropEffect = 'move'
  let effectAllowed = 'all'
  let data = {}
  let types = Object.keys(data)
  let dragImage
  let dragImageOffset = {x: 0, y: 0}

  function clearData(type) {
    if (type) {
      delete data[type]
      types = Object.keys(data)
    } else {
      data = {}
      types = []
    }
  }

  function getData(type) {
    return data[type]
  }

  function setData(type, value) {
    data[type] = value
    types = Object.keys(data)
  }

  function setDragImage(image, offsetX, offsetY) {
    dragImage = image
    dragImageOffset = {x: offsetX, y: offsetY}
  }

  return ({
    dropEffect,
    effectAllowed,
    types,
    getData,
    setData,
    clearData,
    setDragImage,
    dragImage,
    dragImageOffset
  })
}

const defaultConfig = {
  generateDragImage: true,
  dragInitDelay: 160,
  dragInitThreshold: 5,
  doubleClickInterval: 500,
  contextMenuDelay: 1000,
  dragImageOpacity: 0.5,
  handleMultiTouch: false
}

let isListening = false

export default function initTouchDragDrop(initialConfig) {
  const config = {...defaultConfig, ...initialConfig}
  let isDragging = false
  let dragCanStart = false
  let usingDnDApi = false
  let contextMenu = false
  let dragSource
  let dragImage
  let dragImageOffset
  let dataTransfer
  let touchId = 0
  let touchPoint
  let lastClick = Date.now()
  let lastTouch
  let lastTarget

  const removableAttributes = 'id,class,style,draggable'.split(',') // potentially troublesome attributes
  const coordinateProperties = 'pageX,pageY,clientX,clientY,screenX,screenY'.split(',')
  const keyProperties = 'altKey,ctrlKey,metaKey,shiftKey'.split(',')

  // Staff functions
  function reset() {
    destroyImage()
    dragSource = null
    touchPoint = null
    dataTransfer = DataTransfer()
    lastTouch = null
    isDragging = false
    usingDnDApi = false
    dragCanStart = false
    contextMenu = false
  }

  function shouldHandle(event) {
    return event && !event.defaultPrevented &&
         !!event.touches && (event.touches.length < 2 || config.handleMultiTouch)
  }

  function copyProps(dest, source, props) {
    props.forEach(property => dest[property] = source[property])
  }

  const copyStyle = (source, dest) => {
    removableAttributes.forEach(attribute => dest.removeAttribute(attribute))

    if (source instanceof HTMLCanvasElement) {
      const canvasSource = source
      const canvasDest = dest

      canvasDest.width = canvasSource.width
      canvasDest.height = canvasSource.height
      canvasDest.getContext('2d').drawImage(canvasSource, 0, 0)
    }

    const sourceStyle = getComputedStyle(source)
    for (let i = 0; i < sourceStyle.length; i++) {
      const key = sourceStyle[i]
      dest.style[key] = sourceStyle[key]
    }
    dest.style.pointerEvents = 'none'
    for (let i = 0; i < source.children.length; i++) {
      copyStyle(source.children[i], dest.children[i])
    }
  }

  function getPoint(event, page) {
    const coordSource = event.touches ? event.touches[0] : event

    return ({
      x: page ? coordSource.pageX : coordSource.clientX,
      y: page ? coordSource.pageY : coordSource.clientY
    })
  }

  function getDelta(point1, point2) {
    return Math.abs(point2.x - point1.x) + Math.abs(point2.y - point1.y)
  }

  function getTarget(event) {
    const {x, y} = getPoint(event)
    let element = document.elementFromPoint(x, y)
    while (element && getComputedStyle(element).pointerEvents === 'none') {
      element = element.parentElement
    }
    return element
  }

  function getClosestDraggable(element) {
    let draggableElement = element
    while (draggableElement && !draggableElement.hasAttribute('draggable')) {
      draggableElement = draggableElement.parentElement
    }
    return draggableElement || null
  }

  function dispatchEvent(event, type, target, eventProperties) {
    if (!event || !target) { return false }

    const coordinateSource = event.touches ? event.touches[0] : event
    const targetCoordinates = target.getBoundingClientRect()

    const newEvent = new CustomEvent(type, {bubbles: true, cancelable: true})
    copyProps(newEvent, event, keyProperties),
    copyProps(newEvent, coordinateSource, coordinateProperties),
    newEvent.dataTransfer = dataTransfer
    newEvent.offsetX = coordinateSource.pageX - targetCoordinates.left
    newEvent.offsetY = coordinateSource.pageY - targetCoordinates.top
    newEvent.buttons = event.touches.length || event.buttons || 0
    newEvent.which = event.touches.length || event.buttons || 0
    newEvent.button = 0
    if (eventProperties && typeof eventProperties === 'object') {
      copyProps(newEvent, eventProperties, Object.keys(eventProperties))
    }

    target.dispatchEvent(newEvent)
    return newEvent.defaultPrevented
  }

  function destroyImage() {
    if (dragImage && dragImage.parentElement) {
      dragImage.parentElement.removeChild(dragImage)
    }
    dragImage = null
    dragImageOffset = null
  }

  function moveImage(event) {
    requestAnimationFrame(() => {
       const {x, y} = getPoint(event)
       const left = Math.round(x - dragImageOffset.x)
       const top = Math.round(y - dragImageOffset.y)
       dragImage.style['-webkit-transform'] = `translate(${left}px, ${top}px)`
      dragImage.style['-ms-transform'] = `translate(${left}px, ${top}px)`
    })
  }

  function createImage(event) {
    if (dragImage) { destroyImage() }

    const customImage = dataTransfer && dataTransfer.dragImage
    const imageSource = customImage ? dataTransfer.dragImage : dragSource

    dragImage = imageSource.cloneNode(true)
    copyStyle(imageSource, dragImage)
    dragImage.style.position = 'fixed'
    dragImage.style.zIndex = '9999'
    dragImage.style.top = dragImage.style.left = '0px'

    if (!customImage) {
      const sourceRect = imageSource.getBoundingClientRect()
      const cursor = getPoint(event)
      dragImageOffset = {
        x: cursor.x - sourceRect.left,
        y: cursor.y - sourceRect.top
      }
      dragImage.style.opacity = `${config.dragImageOpacity}`
    } else {
      dragImageOffset = dataTransfer.dragImageOffset
    }

    moveImage(event)
    document.body.appendChild(dragImage)
  }

  function startDrag(event) {
    isDragging = true
    if (dispatchEvent(event, 'mousedown', event.target)) { return }

    dragSource = getClosestDraggable(event.target)
    lastTouch = event
    event.preventDefault()

    if (dragSource) {
      usingDnDApi = true
      dataTransfer = DataTransfer()
      dispatchEvent(event, 'dragstart', dragSource)
      dispatchEvent(event, 'dragenter', getTarget(event))
      if (config.generateDragImage) {
        createImage(event)
      }
    }
  }

  // Touch event handling
  function touchStart(event) {
    if (!shouldHandle(event)) {return }

    event.preventDefault()

    if (Date.now() - lastClick < config.doubleClickInterval) {
      if (dispatchEvent(event, 'dbclick', event.target)) {
        reset()
        return
      }
    }

    reset()
    touchId++
    const currentTouchId = touchId
    touchPoint = getPoint(event)
    lastTouch = event

    if (event.touches.length === 2) {
      dragCanStart = true
    } else if (event.touches.length === 1) {
      setTimeout(
        () => {
          if (touchId === currentTouchId) {
            dragCanStart = true
          }
        },
        config.dragInitDelay
      )

      setTimeout(
        () => {
          if (!isDragging) {
            contextMenu = true
            dispatchEvent(event, 'contextmenu', event.target)
          }
        },
        config.contextMenuDelay
      )
    }
  }

  function touchMove(event) {
    if (!shouldHandle(event)) {return }

    const target = getTarget(event)

    if (dispatchEvent(event, 'mousemove', target)) {
      lastTouch = event
      event.preventDefault()
      return
    }

    const delta = getDelta(touchPoint, getPoint(event))
    if (!isDragging && !dragCanStart && delta > config.dragInitThreshold) {
      touchId++
    } else if (!isDragging && delta > config.dragInitThreshold) {
      startDrag(lastTouch)
    }

    if (isDragging && usingDnDApi) {
      lastTouch = event
      event.preventDefault()

      if (target !== lastTarget) {
        dispatchEvent(lastTouch, 'dragleave', lastTarget)
        dispatchEvent(event, 'dragenter', target)
        lastTarget = target
      }

      dispatchEvent(event, 'dragover', target)

      if (dragImage) {
        moveImage(event)
      }
    }
  }

  function touchEnd(event) {
    if (!shouldHandle(event)) {return }

    if (!isDragging && !contextMenu) {
      dragSource = null
      dispatchEvent(lastTouch, 'click', event.target)
      lastClick = Date.now()
      touchId++
    } else if (usingDnDApi) {
      if (event.type.indexOf('cancel') < 0) {
        dispatchEvent(lastTouch, 'drop', lastTarget)
      }

      dispatchEvent(lastTouch, 'dragend', dragSource)

      reset()
    } else {
      dispatchEvent(lastTouch, 'mouseup', event.target)
      reset()
    }
  }

  if (!isListening && 'ontouchstart' in window) {
    document.addEventListener('touchstart', touchStart, {passive: false})
    document.addEventListener('touchmove', touchMove, {passive: false})
    document.addEventListener('touchend', touchEnd, {passive: false})
    document.addEventListener('touchcancel', touchEnd, {passive: false})
    isListening = true
  }
}
