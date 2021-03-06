import React from 'react'
import * as Globals from '../animated/Globals'
import { useSpring } from './SpringHook'
import { useTrail } from './TrailHook'
import { callProp } from '../shared/helpers'

export function parseKeyframedUpdate(slots, config, setNext, cancel) {
  if (Array.isArray(slots)) {
    let q = Promise.resolve()
    for (let i = 0; i < slots.length; i++) {
      const slot = slots[i]
      const last = i === slots.length - 1
      q = q.then(() =>
        setNext(
          {
            config: config && (Array.isArray(config) ? config[i] : config),
            ...slot,
          },
          last
        )
      )
    }
  } else if (typeof slots === 'function') {
    let index = 0
    slots(
      (animatedProps, last = false) => {
        const props = {
          config: config && Array.isArray(config) ? config[index++] : config,
          ...animatedProps,
        }
        return setNext(props, last)
      },
      (finished = true) => cancel && cancel(finished)
    )
  } else {
    setNext(
      {
        config: config && Array.isArray(config) ? config[0] : config,
        ...slots,
      },
      true
    )
  }
}

export function onKeyframesHalt({ resolverRef, lastRef, mounted, onRestRef }) {
  return function(ctrl) {
    return function({ finished }) {
      resolverRef.current && resolverRef.current()
      const merged = ctrl && ctrl.merged
      const { onRest, onKeyframeRest } = onRestRef.current
      if (finished && lastRef.current && mounted.current) {
        onKeyframeRest && onKeyframeRest(merged)
        onRest && onRest(merged)
      }
    }
  }
}

export function setNext(
  resolverRef = { current: null },
  lastRef = { current: null },
  setAnimation,
  onRestRef = { current: { onKeyframeRest: null } },
  shouldForceUpdateRef = { current: false },
  forceUpdate
) {
  return function(props, last) {
    return new Promise(resolve => {
      const { onRest, ...animatedProps } = props || {}
      onRestRef.current.onKeyframeRest = onRest
      resolverRef.current = resolve
      lastRef.current = last
      setAnimation && setAnimation(animatedProps)
      shouldForceUpdateRef.current &&
        Globals.requestFrame(() => {
          shouldForceUpdateRef.current = false
          forceUpdate()
        })
    })
  }
}

/**
 *
 * @param {(useSpring | useTrail)} useImpl
 * @param {Object} props
 * @param {Array=} props.items // only needed when using Trail primitive
 * @param {Object} props.states
 * @param {SpringProps} ...props
 * @param {String} state
 * @param {SpringProps} initialProps
 */
const useKeyframesImpl = useImpl => (props, initialProps = null) => (
  ...params
) => {
  const resolverRef = React.useRef(null)
  const onRestRef = React.useRef({ onRest: null, onKeyframeRest: null })
  const lastRef = React.useRef(true)
  const mounted = React.useRef(false)
  const [state, count] =
    params.length === 2 ? params.reduceRight((a, b) => [a, b]) : params

  // need to force a rerender for when the animated controller has finally accepted props
  const [, forceUpdate] = React.useState()
  const shouldForceUpdateRef = React.useRef(!initialProps)

  const { states, config } = (function() {
    if (Array.isArray(props) || typeof props === 'function') {
      return { states: { [state]: props } }
    } else {
      const { onRest, config, ...rest } = props
      onRestRef.current.onRest = onRest
      return { states: rest, config }
    }
  })()

  const calculatedProps = () => ({
    ...initialProps,
    onKeyframesHalt: onKeyframesHalt({
      resolverRef,
      lastRef,
      mounted,
      onRestRef,
    }),
  })

  const args =
    typeof count === 'number' ? [count, calculatedProps] : [calculatedProps]

  const [animProps, setAnimation, cancel] = useImpl(...args)

  const setNextKeyFrame = setNext(
    resolverRef,
    lastRef,
    setAnimation,
    onRestRef,
    shouldForceUpdateRef,
    forceUpdate
  )
  React.useEffect(() => {
    mounted.current = true
    return () => (mounted.current = false)
  }, [])

  React.useEffect(
    () => {
      void (
        mounted.current &&
        parseKeyframedUpdate(
          states[state],
          callProp(config, state),
          setNextKeyFrame,
          cancel
        )
      )
    },
    [state]
  )
  return shouldForceUpdateRef.current && Array.isArray(animProps)
    ? []
    : animProps
}

export const useKeyframes = {
  spring: (...args) => useKeyframesImpl(useSpring)(...args),
  trail: (...args) => useKeyframesImpl(useTrail)(...args),
}
