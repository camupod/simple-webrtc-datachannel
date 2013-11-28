function EventTarget() {
    var handlers = {};
    this.on = function (type, handler) {
        handlers[type] = handlers[type] || [];
        handlers[type].push(handler);
    };
    this.off = function (type, handler) {
        var i, len,
            typeHandlers = handlers[type];

        if (typeHandlers) {
            // if handler is not specified, remove all 
            // handlers of the given type
            if (!handler) {
                typeHandlers.length = 0;
                return;
            }
            for (i = 0, len = typeHandlers.length; i < len; i++) {
                if (typeHandlers[i] === handler) {
                    typeHandlers.splice(i, 1);
                    break;
                }
            }
        }
    };
    this.fire = function (type, data) {
        var i, len,
            typeHandlers,
            event = {
                type: type,
                data: data
            };

        // if there are handlers for the event, call them in order
        typeHandlers = handlers[type];
        if (typeHandlers) {
            for (i = 0, len = typeHandlers.length; i < len; i++) {
                if (typeHandlers[i]) {
                    typeHandlers[i].call(this, event);
                }
            }
        }
    };
}