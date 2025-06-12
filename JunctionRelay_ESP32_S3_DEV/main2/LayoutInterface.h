//------------------------------------------------------------------------------
// LayoutInterface.h
//------------------------------------------------------------------------------
#ifndef LAYOUT_INTERFACE_H
#define LAYOUT_INTERFACE_H

#include <ArduinoJson.h>
#include <lvgl.h>

class LayoutInterface {
public:
    virtual ~LayoutInterface() = default;
    
    // Core lifecycle: idempotent create, destroy, update
    virtual void create(const JsonDocument &configDoc) = 0;
    virtual void destroy() = 0;
    virtual void update(const JsonDocument &sensorDoc) = 0;
    
    // Get the LVGL screen object for animated swaps
    virtual lv_obj_t* getScreen() const = 0;

    // Clean up per-layout timers/tasks
    virtual void destroyTimers() = 0;
    
    // State tracking
    virtual bool isCreated() const = 0;
    virtual bool isDestroyed() const = 0;
    
    // Optional helper methods
    virtual void registerSensors(const JsonDocument &configDoc) = 0;
};

#endif // LAYOUT_INTERFACE_H
