define(function(require, exports, module) {

    var $ = require('$'),
        LEFT = 'left',
        RIGHT = 'right',
        UP = 'up',
        DOWN = 'down',
        IN = 'in',
        OUT = 'out',
        NONE = 'none',
        AUTO = 'auto',
        SWIPE = 'swipe',
        PINCH = 'pinch',
        TAP = 'tap',
        DOUBLE_TAP = 'doubletap',
        LONG_TAP = 'longtap',
        HOLD = 'hold',
        HORIZONTAL = 'horizontal',
        VERTICAL = 'vertical',
        ALL_FINGERS = 'all',
        DOUBLE_TAP_THRESHOLD = 10,
        PHASE_START = 'start',
        PHASE_MOVE = 'move',
        PHASE_END = 'end',
        PHASE_CANCEL = 'cancel',        
        SUPPORTS_TOUCH = 'ontouchstart' in window,
        SUPPORTS_POINTER_IE10 = window.navigator.msPointerEnabled && !window.navigator.pointerEnabled,
        SUPPORTS_POINTER = window.navigator.pointerEnabled || window.navigator.msPointerEnabled,
        PLUGIN_NS = 'TouchSwipe';

    /**
     * 默认参数
     */
    var defaults = {
        fingers: 1, // 操作手指数
        threshold: 75, //触发的临界值
        cancelThreshold: null, //取消操作的临界值
        pinchThreshold: 20, //判定为pinch的临界值
        maxTimeThreshold: null, //touchStart 与 touchEnd 之间的毫秒数
        fingerReleaseThreshold: 250, //
        longTapThreshold: 500, //判断为longTap的毫秒数
        doubleTapThreshold: 200, //双击的间隔毫秒数
        swipe: null, //swipe的回调函数
        swipeLeft: null, //swipeLeft的回调函数
        swipeRight: null, //swipeRight的回调函数
        swipeUp: null, //swipeUp的回调函数
        swipeDown: null, //swipeDown的回调函数
        swipeStatus: null, //swipeStatus的回调函数
        pinchIn: null, //pinchIn的回调函数
        pinchOut: null, //pinchOut的回调函数
        pinchStatus: null, //pinchStatus的回调函数
        tap: null, //tap的回调函数
        doubleTap: null, //doubleTap的回调函数
        longTap: null, //longTap的回调函数
        hold: null, //hold的回调函数
        triggerOnTouchEnd: true, //触发回调函数的时机，true为用户手指离开屏幕执行，false为达到临界值就执行
        triggerOnTouchLeave: false, //手指离开选定对象时是否触发回调
        allowPageScroll: 'auto', //浏览器处理页面滚动的方式， 可选值： 'auto': 自由滚动 , 'none': 禁止滚动, 'horizontal': 只允许水平滚动, 'vertical': 只允许垂直滚动
        fallbackToMouseEvents: true, //不支持TOUCH的设备上是否回退到鼠标操作
        excludedElements: 'label, button, input, select, textarea, a, .noSwipe', //需要排除的元素
        preventDefaultEvents: true //是否取消默认事件 
    };


    $.fn.swipe = function(method) {
        var $this = $(this),
            plugin = $this.data(PLUGIN_NS);

        if (plugin && typeof method === 'string') {
            if (plugin[method]) {
                return plugin[method].apply(this, Array.prototype.slice.call(arguments, 1));
            } else {
                $.error('没有这个方法:' + method);
            }
        } else if (!plugin && (typeof method === 'object' || !method)) {
            return init.apply(this, arguments);
        }

        return $this;
    };

    $.fn.swipe.defaults = defaults;
    $.fn.swipe.phases = {
        PHASE_START: PHASE_START,
        PHASE_MOVE: PHASE_MOVE,
        PHASE_END: PHASE_END,
        PHASE_CANCEL: PHASE_CANCEL
    };
    $.fn.swipe.directions = {
        LEFT: LEFT,
        RIGHT: RIGHT,
        UP: UP,
        DOWN: DOWN,
        IN: IN,
        OUT: OUT
    };
    $.fn.swipe.pageScroll = {
        NONE: NONE,
        HORIZONTAL: HORIZONTAL,
        VERTICAL: VERTICAL,
        AUTO: AUTO
    };
    $.fn.swipe.fingers = {
        ONE: 1,
        TWO: 2,
        THREE: 3,
        ALL: ALL_FINGERS
    };

    function init(options) {
        if (options && (options.allowPageScroll === undefined && (options.swipe !== undefined || options.swipeStatus !== undefined))) {
            options.allowPageScroll = NONE;
        }

        if (!options) {
            options = {};
        }

        options = $.extend({}, $.fn.swipe.defaults, options);

        return this.each(function() {
            var $this = $(this);

            var plugin = $this.data(PLUGIN_NS);

            if (!plugin) {
                plugin = new TouchSwipe(this, options);
                $this.data(PLUGIN_NS, plugin);
            }
        });
    }

    /**
     * @private
     * @name TouchSwipe
     * @param {DOMNode} element SWIPE的DOM元素
     * @param {Object} options 选项
     * @class
     */
    function TouchSwipe(element, options) {
        var useTouchEvents = (SUPPORTS_TOUCH || SUPPORTS_POINTER || !options.fallbackToMouseEvents),
            START_EV = useTouchEvents ? (SUPPORTS_POINTER ? (SUPPORTS_POINTER_IE10 ? 'MSPointerDown' : 'pointerdown') : 'touchstart') : 'mousedown',
            MOVE_EV = useTouchEvents ? (SUPPORTS_POINTER ? (SUPPORTS_POINTER_IE10 ? 'MSPointerMove' : 'pointermove') : 'touchmove') : 'mousemove',
            END_EV = useTouchEvents ? (SUPPORTS_POINTER ? (SUPPORTS_POINTER_IE10 ? 'MSPointerUp' : 'pointerup') : 'touchend') : 'mouseup',
            LEAVE_EV = useTouchEvents ? null : 'mouseleave', //we manually detect leave on touch devices, so null event here
            CANCEL_EV = (SUPPORTS_POINTER ? (SUPPORTS_POINTER_IE10 ? 'MSPointerCancel' : 'pointercancel') : 'touchcancel');

        var distance = 0,
            direction = null,
            duration = 0,
            startTouchesDistance = 0,
            endTouchesDistance = 0,
            pinchZoom = 1,
            pinchDistance = 0,
            pinchDirection = 0,
            maximumsMap = null;

        var $element = $(element);
        var phase = 'start';
        var fingerCount = 0;
        var fingerData = null;
        var startTime = 0,
            endTime = 0,
            previousTouchEndTime = 0,
            previousTouchFingerCount = 0,
            doubleTapStartTime = 0;

        var singleTapTimeout = null,
            holdTimeout = null;

        try {
            $element.bind(START_EV, touchStart);
            $element.bind(CANCEL_EV, touchCancel);
        } catch (e) {
            $.error('不支持触摸事件');
        }

        //
        //公共方法
        //

        /**
         * 用原设置重新启用SWIPE
         * @function
         * @name $.fn.swipe#enable
         * @return {DOMNode} 绑定SWIPE的元素
         * @example $("#element").swipe("enable");
         */
        this.enable = function() {
            $element.bind(START_EV, touchStart);
            $element.bind(CANCEL_EV, touchCancel);
            return $element;
        };

        /**
         * 禁用
         * @function
         * @name $.fn.swipe#disable
         * @return {DOMNode} 绑定SWIPE的元素
         * @example $("#element").swipe("disable");
         */
        this.disable = function() {
            removeListeners();
            return $element;
        };

        /**
         * 销毁SWIPE，要重新绑定必须初始化
         * @function
         * @name $.fn.swipe#destroy
         * @example $("#element").swipe("destroy");
         */
        this.destroy = function() {
            removeListeners();
            $element.data(PLUGIN_NS, null);
            $element = null;
        };

        this.option = function(property, value) {
            if (options[property] !== undefined) {
                if (value === undefined) {
                    return options[property];
                } else {
                    options[property] = value;
                }
            } else {
                $.error('不存在的属性:' + property);
            }
            return null;
        };

        function touchStart(jqEvent) {
            if (getTouchInProgress()){
            	return;
            }
                

            if ($(jqEvent.target).closest(options.excludedElements, $element).length > 0){
            	return;
            }
                

            var event = jqEvent.originalEvent ? jqEvent.originalEvent : jqEvent;

            var ret,
                evt = SUPPORTS_TOUCH ? event.touches[0] : event;

            phase = PHASE_START;

            if (SUPPORTS_TOUCH) {
                fingerCount = event.touches.length;
            } else {
                jqEvent.preventDefault();
            }

            distance = 0;
            direction = null;
            pinchDirection = null;
            duration = 0;
            startTouchesDistance = 0;
            endTouchesDistance = 0;
            pinchZoom = 1;
            pinchDistance = 0;
            fingerData = createAllFingerData();
            maximumsMap = createMaximumsData();
            cancelMultiFingerRelease();


            if (!SUPPORTS_TOUCH || (fingerCount === options.fingers || options.fingers === ALL_FINGERS) || hasPinches()) {
                createFingerData(0, evt);
                startTime = getTimeStamp();

                if (fingerCount == 2) {
                    createFingerData(1, event.touches[1]);
                    startTouchesDistance = endTouchesDistance = calculateTouchesDistance(fingerData[0].start, fingerData[1].start);
                }

                if (options.swipeStatus || options.pinchStatus) {
                    ret = triggerHandler(event, phase);
                }
            } else {
                ret = false;
            }

            if (ret === false) {
                phase = PHASE_CANCEL;
                triggerHandler(event, phase);
                return ret;
            } else {
                if (options.hold) {
                    holdTimeout = setTimeout($.proxy(function() {
                        $element.trigger('hold', [event.target]);
                        if (options.hold) {
                            ret = options.hold.call($element, event, event.target);
                        }
                    }, this), options.longTapThreshold);
                }

                setTouchInProgress(true);
            }

            return null;
        }

        function touchMove(jqEvent) {

            var event = jqEvent.originalEvent ? jqEvent.originalEvent : jqEvent;
            if (phase === PHASE_END || phase === PHASE_CANCEL || inMultiFingerRelease()){
            	return;
            }
                
            var ret,
                evt = SUPPORTS_TOUCH ? event.touches[0] : event;

            var currentFinger = updateFingerData(evt);
            endTime = getTimeStamp();
            if (SUPPORTS_TOUCH) {
                fingerCount = event.touches.length;
            }
            if (options.hold){
            	clearTimeout(holdTimeout);
            }
                
            phase = PHASE_MOVE;
            if (fingerCount == 2) {
                if (startTouchesDistance === 0) {
                    createFingerData(1, event.touches[1]);
                    startTouchesDistance = endTouchesDistance = calculateTouchesDistance(fingerData[0].start, fingerData[1].start);
                } else {
                    updateFingerData(event.touches[1]);
                    endTouchesDistance = calculateTouchesDistance(fingerData[0].end, fingerData[1].end);
                    pinchDirection = calculatePinchDirection(fingerData[0].end, fingerData[1].end);
                }
                pinchZoom = calculatePinchZoom(startTouchesDistance, endTouchesDistance);
                pinchDistance = Math.abs(startTouchesDistance - endTouchesDistance);
            }

            if ((fingerCount === options.fingers || options.fingers === ALL_FINGERS) || !SUPPORTS_TOUCH || hasPinches()) {
                direction = calculateDirection(currentFinger.start, currentFinger.end);
                validateDefaultEvent(jqEvent, direction);
                distance = calculateDistance(currentFinger.start, currentFinger.end);
                duration = calculateDuration();
                setMaxDistance(direction, distance);

                if (options.swipeStatus || options.pinchStatus) {
                    ret = triggerHandler(event, phase);
                }

                if (!options.triggerOnTouchEnd || options.triggerOnTouchLeave) {
                    var inBounds = true;
                    if (options.triggerOnTouchLeave) {
                        var bounds = getbounds(this);
                        inBounds = isInBounds(currentFinger.end, bounds);
                    }
                    if (!options.triggerOnTouchEnd && inBounds) {
                        phase = getNextPhase(PHASE_MOVE);
                    } else if (options.triggerOnTouchLeave && !inBounds) {
                        phase = getNextPhase(PHASE_END);
                    }
                    if (phase == PHASE_CANCEL || phase == PHASE_END) {
                        triggerHandler(event, phase);
                    }
                }
            } else {
                phase = PHASE_CANCEL;
                triggerHandler(event, phase);
            }

            if (ret === false) {
                phase = PHASE_CANCEL;
                triggerHandler(event, phase);
            }
        }

        function touchEnd(jqEvent) {
            var event = jqEvent.originalEvent;
            if (SUPPORTS_TOUCH) {
                if (event.touches.length > 0) {
                    startMultiFingerRelease();
                    return true;
                }
            }
            if (inMultiFingerRelease()) {
                fingerCount = previousTouchFingerCount;
            }

            endTime = getTimeStamp();
            duration = calculateDuration();

            if (didSwipeBackToCancel() || !validateSwipeDistance()) {
                phase = PHASE_CANCEL;
                triggerHandler(event, phase);
            } else if (options.triggerOnTouchEnd || (options.triggerOnTouchEnd === false && phase === PHASE_MOVE)) {
                jqEvent.preventDefault();
                phase = PHASE_END;
                triggerHandler(event, phase);
            } else if (!options.triggerOnTouchEnd && hasTap()) {
                phase = PHASE_END;
                triggerHandlerForGesture(event, phase, TAP);
            } else if (phase === PHASE_MOVE) {
                phase = PHASE_CANCEL;
                triggerHandler(event, phase);
            }

            setTouchInProgress(false);

            return null;
        }

        function touchCancel() {
            fingerCount = 0;
            endTime = 0;
            startTime = 0;
            startTouchesDistance = 0;
            endTouchesDistance = 0;
            pinchZoom = 1;

            cancelMultiFingerRelease();
            setTouchInProgress(false);
        }

        function touchLeave(jqEvent) {
            var event = jqEvent.originalEvent;

            if (options.triggerOnTouchLeave) {
                phase = getNextPhase(PHASE_END);
                triggerHandler(event, phase);
            }
        }

        function removeListeners() {
            $element.unbind(START_EV, touchStart);
            $element.unbind(CANCEL_EV, touchCancel);
            $element.unbind(MOVE_EV, touchMove);
            $element.unbind(END_EV, touchEnd);

            if (LEAVE_EV) {
                $element.unbind(LEAVE_EV, touchLeave);
            }

            setTouchInProgress(false);
        }

        function getNextPhase(currentPhase) {

            var nextPhase = currentPhase;
            var validTime = validateSwipeTime();
            var validDistance = validateSwipeDistance();
            var didCancel = didSwipeBackToCancel();

            if (!validTime || didCancel) {
                nextPhase = PHASE_CANCEL;
            } else if (validDistance && currentPhase == PHASE_MOVE && (!options.triggerOnTouchEnd || options.triggerOnTouchLeave)) {
                nextPhase = PHASE_END;
            } else if (!validDistance && currentPhase == PHASE_END && options.triggerOnTouchLeave) {
                nextPhase = PHASE_CANCEL;
            }
            return nextPhase;
        }

        function triggerHandler(event, phase) {
            var ret; //var ret = undefined;

            if ((didSwipe() || hasSwipes()) || (didPinch() || hasPinches())) {
                if (didSwipe() || hasSwipes()) {
                    ret = triggerHandlerForGesture(event, phase, SWIPE);
                }

                if ((didPinch() || hasPinches()) && ret !== false) {
                    ret = triggerHandlerForGesture(event, phase, PINCH);
                }
            } else {
                if (didDoubleTap() && ret !== false) {
                    ret = triggerHandlerForGesture(event, phase, DOUBLE_TAP);
                } else if (didLongTap() && ret !== false) {
                    ret = triggerHandlerForGesture(event, phase, LONG_TAP);
                } else if (didTap() && ret !== false) {
                    ret = triggerHandlerForGesture(event, phase, TAP);
                }
            }

            if (phase === PHASE_CANCEL) {
                touchCancel(event);
            }

            if (phase === PHASE_END) {
                if (SUPPORTS_TOUCH) {
                    if (event.touches.length === 0) {
                        touchCancel(event);
                    }
                } else {
                    touchCancel(event);
                }
            }

            return ret;
        }


        function triggerHandlerForGesture(event, phase, gesture) {

            var ret; //var ret = undefined;

            if (gesture == SWIPE) {
                $element.trigger('swipeStatus', [phase, direction || null, distance || 0, duration || 0, fingerCount, fingerData]);
                if (options.swipeStatus) {
                    ret = options.swipeStatus.call($element, event, phase, direction || null, distance || 0, duration || 0, fingerCount, fingerData);
                    if (ret === false){
                    	return false;
                    } 
                }

                if (phase == PHASE_END && validateSwipe()) {
                    $element.trigger('swipe', [direction, distance, duration, fingerCount, fingerData]);

                    if (options.swipe) {
                        ret = options.swipe.call($element, event, direction, distance, duration, fingerCount, fingerData);
                        /*jshint maxdepth:5 */
                        if (ret === false){
                        	return false;
                        } 
                    }

                    switch (direction) {
                        case LEFT:
                            $element.trigger('swipeLeft', [direction, distance, duration, fingerCount, fingerData]);
                            if (options.swipeLeft) {
                                ret = options.swipeLeft.call($element, event, direction, distance, duration, fingerCount, fingerData);
                            }
                            break;

                        case RIGHT:
                            $element.trigger('swipeRight', [direction, distance, duration, fingerCount, fingerData]);
                            if (options.swipeRight) {
                                ret = options.swipeRight.call($element, event, direction, distance, duration, fingerCount, fingerData);
                            }
                            break;

                        case UP:
                            $element.trigger('swipeUp', [direction, distance, duration, fingerCount, fingerData]);
                            if (options.swipeUp) {
                                ret = options.swipeUp.call($element, event, direction, distance, duration, fingerCount, fingerData);
                            }
                            break;

                        case DOWN:
                            $element.trigger('swipeDown', [direction, distance, duration, fingerCount, fingerData]);
                            if (options.swipeDown) {
                                ret = options.swipeDown.call($element, event, direction, distance, duration, fingerCount, fingerData);
                            }
                            break;
                    }
                }
            }


            if (gesture == PINCH) {
                $element.trigger('pinchStatus', [phase, pinchDirection || null, pinchDistance || 0, duration || 0, fingerCount, pinchZoom, fingerData]);

                if (options.pinchStatus) {
                    ret = options.pinchStatus.call($element, event, phase, pinchDirection || null, pinchDistance || 0, duration || 0, fingerCount, pinchZoom, fingerData);
                    if (ret === false){
                    	return false;
                    } 
                }

                if (phase == PHASE_END && validatePinch()) {

                    switch (pinchDirection) {
                        case IN:
                            $element.trigger('pinchIn', [pinchDirection || null, pinchDistance || 0, duration || 0, fingerCount, pinchZoom, fingerData]);
                            if (options.pinchIn) {
                                ret = options.pinchIn.call($element, event, pinchDirection || null, pinchDistance || 0, duration || 0, fingerCount, pinchZoom, fingerData);
                            }
                            break;

                        case OUT:
                            $element.trigger('pinchOut', [pinchDirection || null, pinchDistance || 0, duration || 0, fingerCount, pinchZoom, fingerData]);

                            if (options.pinchOut) {
                                ret = options.pinchOut.call($element, event, pinchDirection || null, pinchDistance || 0, duration || 0, fingerCount, pinchZoom, fingerData);
                            }
                            break;
                    }
                }
            }





            if (gesture == TAP) {
                if (phase === PHASE_CANCEL || phase === PHASE_END) {


                    clearTimeout(singleTapTimeout);
                    clearTimeout(holdTimeout);
                    if (hasDoubleTap() && !inDoubleTap()) {
                        doubleTapStartTime = getTimeStamp();
                        singleTapTimeout = setTimeout($.proxy(function() {
                            doubleTapStartTime = null;
                            $element.trigger('tap', [event.target]);
                            if (options.tap) {
                                ret = options.tap.call($element, event, event.target);
                            }
                        }, this), options.doubleTapThreshold);

                    } else {
                        doubleTapStartTime = null;
                        $element.trigger('tap', [event.target]);
                        if (options.tap) {
                            ret = options.tap.call($element, event, event.target);
                        }
                    }
                }
            } else if (gesture == DOUBLE_TAP) {
                if (phase === PHASE_CANCEL || phase === PHASE_END) {
                    clearTimeout(singleTapTimeout);
                    doubleTapStartTime = null;
                    $element.trigger('doubletap', [event.target]);
                    if (options.doubleTap) {
                        ret = options.doubleTap.call($element, event, event.target);
                    }
                }
            } else if (gesture == LONG_TAP) {
                if (phase === PHASE_CANCEL || phase === PHASE_END) {
                    clearTimeout(singleTapTimeout);
                    doubleTapStartTime = null;
                    $element.trigger('longtap', [event.target]);
                    if (options.longTap) {
                        ret = options.longTap.call($element, event, event.target);
                    }
                }
            }

            return ret;
        }


        function validateSwipeDistance() {
            var valid = true;
            if (options.threshold !== null) {
                valid = distance >= options.threshold;
            }
            return valid;
        }

        function didSwipeBackToCancel() {
            var cancelled = false;
            if (options.cancelThreshold !== null && direction !== null) {
                cancelled = (getMaxDistance(direction) - distance) >= options.cancelThreshold;
            }

            return cancelled;
        }

        function validatePinchDistance() {
            if (options.pinchThreshold !== null) {
                return pinchDistance >= options.pinchThreshold;
            }
            return true;
        }

        function validateSwipeTime() {
            var result;

            if (options.maxTimeThreshold) {
                if (duration >= options.maxTimeThreshold) {
                    result = false;
                } else {
                    result = true;
                }
            } else {
                result = true;
            }

            return result;
        }

        function validateDefaultEvent(jqEvent, direction) {


            if (options.preventDefaultEvents === false) {
                return;
            }

            if (options.allowPageScroll === NONE) {
                jqEvent.preventDefault();
            } else {
                var auto = options.allowPageScroll === AUTO;

                switch (direction) {
                    case LEFT:
                        if ((options.swipeLeft && auto) || (!auto && options.allowPageScroll != HORIZONTAL)) {
                            jqEvent.preventDefault();
                        }
                        break;

                    case RIGHT:
                        if ((options.swipeRight && auto) || (!auto && options.allowPageScroll != HORIZONTAL)) {
                            jqEvent.preventDefault();
                        }
                        break;

                    case UP:
                        if ((options.swipeUp && auto) || (!auto && options.allowPageScroll != VERTICAL)) {
                            jqEvent.preventDefault();
                        }
                        break;

                    case DOWN:
                        if ((options.swipeDown && auto) || (!auto && options.allowPageScroll != VERTICAL)) {
                            jqEvent.preventDefault();
                        }
                        break;
                }
            }

        }

        function validatePinch() {
            var hasCorrectFingerCount = validateFingers();
            var hasEndPoint = validateEndPoint();
            var hasCorrectDistance = validatePinchDistance();
            return hasCorrectFingerCount && hasEndPoint && hasCorrectDistance;

        }

        function hasPinches() {
            return !!(options.pinchStatus || options.pinchIn || options.pinchOut);
        }

        function didPinch() {
            return !!(validatePinch() && hasPinches());
        }


        function validateSwipe() {
            var hasValidTime = validateSwipeTime();
            var hasValidDistance = validateSwipeDistance();
            var hasCorrectFingerCount = validateFingers();
            var hasEndPoint = validateEndPoint();
            var didCancel = didSwipeBackToCancel();
            var valid = !didCancel && hasEndPoint && hasCorrectFingerCount && hasValidDistance && hasValidTime;

            return valid;
        }

        function hasSwipes() {
            return !!(options.swipe || options.swipeStatus || options.swipeLeft || options.swipeRight || options.swipeUp || options.swipeDown);
        }


        function didSwipe() {
            return !!(validateSwipe() && hasSwipes());
        }

        function validateFingers() {
            return ((fingerCount === options.fingers || options.fingers === ALL_FINGERS) || !SUPPORTS_TOUCH);
        }

        function validateEndPoint() {
            return fingerData[0].end.x !== 0;
        }

        function hasTap() {
            return !!(options.tap);
        }

        function hasDoubleTap() {
            return !!(options.doubleTap);
        }


        function hasLongTap() {
            return !!(options.longTap);
        }

        function validateDoubleTap() {
            if (doubleTapStartTime === null) {
                return false;
            }
            var now = getTimeStamp();
            return (hasDoubleTap() && ((now - doubleTapStartTime) <= options.doubleTapThreshold));
        }

        function inDoubleTap() {
            return validateDoubleTap();
        }


        function validateTap() {
            return ((fingerCount === 1 || !SUPPORTS_TOUCH) && (isNaN(distance) || distance < options.threshold));
        }


        function validateLongTap() {
            return ((duration > options.longTapThreshold) && (distance < DOUBLE_TAP_THRESHOLD));
        }

        function didTap() {
            return !!(validateTap() && hasTap());
        }


        function didDoubleTap() {
            return !!(validateDoubleTap() && hasDoubleTap());
        }

        function didLongTap() {
            return !!(validateLongTap() && hasLongTap());
        }


        function startMultiFingerRelease() {
            previousTouchEndTime = getTimeStamp();
            previousTouchFingerCount = event.touches.length + 1;
        }

        function cancelMultiFingerRelease() {
            previousTouchEndTime = 0;
            previousTouchFingerCount = 0;
        }

        function inMultiFingerRelease() {

            var withinThreshold = false;

            if (previousTouchEndTime) {
                var diff = getTimeStamp() - previousTouchEndTime;
                if (diff <= options.fingerReleaseThreshold) {
                    withinThreshold = true;
                }
            }

            return withinThreshold;
        }


        function getTouchInProgress() {
            //strict equality to ensure only true and false are returned
            return !!($element.data(PLUGIN_NS + '_intouch') === true);
        }

        function setTouchInProgress(val) {

            if (val === true) {
                $element.bind(MOVE_EV, touchMove);
                $element.bind(END_EV, touchEnd);

                if (LEAVE_EV) {
                    $element.bind(LEAVE_EV, touchLeave);
                }
            } else {
                $element.unbind(MOVE_EV, touchMove, false);
                $element.unbind(END_EV, touchEnd, false);

                if (LEAVE_EV) {
                    $element.unbind(LEAVE_EV, touchLeave, false);
                }
            }


            $element.data(PLUGIN_NS + '_intouch', val === true);
        }


        function createFingerData(index, evt) {
            var id = evt.identifier !== undefined ? evt.identifier : 0;

            fingerData[index].identifier = id;
            fingerData[index].start.x = fingerData[index].end.x = evt.pageX || evt.clientX;
            fingerData[index].start.y = fingerData[index].end.y = evt.pageY || evt.clientY;

            return fingerData[index];
        }

        function updateFingerData(evt) {

            var id = evt.identifier !== undefined ? evt.identifier : 0;
            var f = getFingerData(id);

            f.end.x = evt.pageX || evt.clientX;
            f.end.y = evt.pageY || evt.clientY;

            return f;
        }

        function getFingerData(id) {
            for (var i = 0; i < fingerData.length; i++) {
                if (fingerData[i].identifier == id) {
                    return fingerData[i];
                }
            }
        }

        function createAllFingerData() {
            var fingerData = [];
            for (var i = 0; i <= 5; i++) {
                fingerData.push({
                    start: {
                        x: 0,
                        y: 0
                    },
                    end: {
                        x: 0,
                        y: 0
                    },
                    identifier: 0
                });
            }

            return fingerData;
        }

        function setMaxDistance(direction, distance) {
            distance = Math.max(distance, getMaxDistance(direction));
            maximumsMap[direction].distance = distance;
        }


        function getMaxDistance(direction) {
            if (maximumsMap[direction]){
            	return maximumsMap[direction].distance;
            } 
            return undefined;
        }

        function createMaximumsData() {
            var maxData = {};
            maxData[LEFT] = createMaximumVO(LEFT);
            maxData[RIGHT] = createMaximumVO(RIGHT);
            maxData[UP] = createMaximumVO(UP);
            maxData[DOWN] = createMaximumVO(DOWN);

            return maxData;
        }

        function createMaximumVO(dir) {
            return {
                direction: dir,
                distance: 0
            };
        }

        function calculateDuration() {
            return endTime - startTime;
        }

        function calculateTouchesDistance(startPoint, endPoint) {
            var diffX = Math.abs(startPoint.x - endPoint.x);
            var diffY = Math.abs(startPoint.y - endPoint.y);

            return Math.round(Math.sqrt(diffX * diffX + diffY * diffY));
        }

        function calculatePinchZoom(startDistance, endDistance) {
            var percent = (endDistance / startDistance) * 1;
            return percent.toFixed(2);
        }

        function calculatePinchDirection() {
            if (pinchZoom < 1) {
                return OUT;
            } else {
                return IN;
            }
        }


        function calculateDistance(startPoint, endPoint) {
            return Math.round(Math.sqrt(Math.pow(endPoint.x - startPoint.x, 2) + Math.pow(endPoint.y - startPoint.y, 2)));
        }


        function calculateAngle(startPoint, endPoint) {
            var x = startPoint.x - endPoint.x;
            var y = endPoint.y - startPoint.y;
            var r = Math.atan2(y, x); //radians
            var angle = Math.round(r * 180 / Math.PI); //degrees

            if (angle < 0) {
                angle = 360 - Math.abs(angle);
            }

            return angle;
        }

        function calculateDirection(startPoint, endPoint) {
            var angle = calculateAngle(startPoint, endPoint);

            if ((angle <= 45) && (angle >= 0)) {
                return LEFT;
            } else if ((angle <= 360) && (angle >= 315)) {
                return LEFT;
            } else if ((angle >= 135) && (angle <= 225)) {
                return RIGHT;
            } else if ((angle > 45) && (angle < 135)) {
                return DOWN;
            } else {
                return UP;
            }
        }


        function getTimeStamp() {
            var now = new Date();
            return now.getTime();
        }


        function getbounds(el) {
            el = $(el);
            var offset = el.offset();

            var bounds = {
                left: offset.left,
                right: offset.left + el.outerWidth(),
                top: offset.top,
                bottom: offset.top + el.outerHeight()
            };

            return bounds;
        }


        function isInBounds(point, bounds) {
            return (point.x > bounds.left && point.x < bounds.right && point.y > bounds.top && point.y < bounds.bottom);
        }


    }
});