// Layout_AstroScreen.cpp - Advanced Sci-Fi Interface

#include "DisplayManager.h"
#include <vector>

void DisplayManager::createAstroScreen(const JsonDocument &configDoc) {
    Serial.println("[DEBUG] Initializing advanced sci-fi AstroScreen interface");
    Serial.printf("[DEBUG] Free heap before: %d bytes\n", ESP.getFreeHeap());
    
    // Extract configuration parameters with enhanced color scheme
    const char* primaryColor = configDoc["lvgl_astro"]["primary_color"] | "#00FFBB"; // Cyan glow
    const char* secondaryColor = configDoc["lvgl_astro"]["secondary_color"] | "#FF3366"; // Magenta accent
    const char* backgroundColor = configDoc["lvgl_astro"]["background_color"] | "#000D14"; // Deep space blue
    const char* gridColor = configDoc["lvgl_astro"]["grid_color"] | "#005555"; // Subdued teal
    const char* highlightColor = configDoc["lvgl_astro"]["highlight_color"] | "#FFCC00"; // Amber alert
    const char* detailColor = configDoc["lvgl_astro"]["detail_color"] | "#0088FF"; // Hologram blue
    
    // Retrieve screen dimensions
    uint16_t screenWidth = device->width();
    uint16_t screenHeight = device->height();
    uint8_t rotation = device->getRotation();
    if (rotation == 90 || rotation == 270) std::swap(screenWidth, screenHeight);
    
    Serial.printf("[DEBUG] Screen dimensions: %dx%d (rotation: %d)\n", 
                 screenWidth, screenHeight, rotation);
    
    // Create main screen with dark space background
    lv_obj_t* scr = lv_obj_create(NULL);
    lv_obj_set_style_bg_color(scr, lv_color_hex(strtoul(backgroundColor + 1, NULL, 16)), 0);
    
    // ================ Create Starfield Background ================
    Serial.println("[DEBUG] Generating dynamic starfield background");
    
    // Generate a starfield with varying star brightness and size
    int starCount = 100; // Number of stars
    for (int i = 0; i < starCount; i++) {
        lv_obj_t* star = lv_obj_create(scr);
        
        // Randomize star size (1-3px)
        int starSize = random(1, 4);
        lv_obj_set_size(star, starSize, starSize);
        
        // Randomize star position
        int xPos = random(0, screenWidth);
        int yPos = random(0, screenHeight);
        lv_obj_set_pos(star, xPos, yPos);
        
        // Randomize star brightness (fully opaque to semi-transparent)
        lv_opa_t opacity = random(LV_OPA_30, LV_OPA_100);
        
        // Randomize star color (occasionally colored stars among white ones)
        uint32_t starColor;
        if (random(0, 10) < 8) {
            // White/blue-ish stars (majority)
            int brightness = random(180, 255);
            starColor = (brightness << 16) | (brightness << 8) | brightness;
        } else {
            // Occasionally colored stars
            switch (random(0, 5)) {
                case 0: starColor = 0xFFCC00; break; // Yellow
                case 1: starColor = 0xFF3366; break; // Red
                case 2: starColor = 0x00BBFF; break; // Blue
                case 3: starColor = 0x00FF88; break; // Green
                default: starColor = 0xFFFFFF; break; // White
            }
        }
        
        lv_obj_set_style_radius(star, LV_RADIUS_CIRCLE, 0); // Make stars circular
        lv_obj_set_style_bg_color(star, lv_color_hex(starColor), 0);
        lv_obj_set_style_bg_opa(star, opacity, 0);
        lv_obj_set_style_border_width(star, 0, 0); // No border for stars
    }
    
    // Create dynamic nebula-like patterns in the background
    for (int i = 0; i < 5; i++) {
        lv_obj_t* nebula = lv_obj_create(scr);
        
        // Large, amorphous shapes
        int nebulaWidth = random(screenWidth/4, screenWidth/2);
        int nebulaHeight = random(screenHeight/4, screenHeight/2);
        lv_obj_set_size(nebula, nebulaWidth, nebulaHeight);
        
        // Position nebulae around screen
        int xPos = random(0, screenWidth - nebulaWidth);
        int yPos = random(0, screenHeight - nebulaHeight);
        lv_obj_set_pos(nebula, xPos, yPos);
        
        // Nebula colors with very low opacity for subtle effect
        uint32_t nebulaColors[] = {0x0033AA, 0x330066, 0x006666, 0x660033, 0x443300};
        uint32_t nebulaColor = nebulaColors[random(0, 5)];
        
        lv_obj_set_style_radius(nebula, nebulaWidth/2, 0); // Rounded shape
        lv_obj_set_style_bg_color(nebula, lv_color_hex(nebulaColor), 0);
        lv_obj_set_style_bg_opa(nebula, LV_OPA_10, 0); // Very subtle
        lv_obj_set_style_border_width(nebula, 0, 0); // No border
        
        // Adjust visual hierarchy
        lv_obj_move_background(nebula);
    }
    
    // ================ Create Main HUD Layout ================
    // Create a glass-like hexagonal main container
    lv_obj_t* mainHud = lv_obj_create(scr);
    int hudWidth = screenWidth * 0.92;
    int hudHeight = screenHeight * 0.92;
    lv_obj_set_size(mainHud, hudWidth, hudHeight);
    lv_obj_align(mainHud, LV_ALIGN_CENTER, 0, 0);
    
    // Style the main HUD with glass effect
    lv_obj_set_style_bg_color(mainHud, lv_color_hex(strtoul(primaryColor + 1, NULL, 16)), 0);
    lv_obj_set_style_bg_opa(mainHud, LV_OPA_10, 0); // Very transparent
    lv_obj_set_style_border_color(mainHud, lv_color_hex(strtoul(primaryColor + 1, NULL, 16)), 0);
    lv_obj_set_style_border_width(mainHud, 2, 0);
    lv_obj_set_style_border_opa(mainHud, LV_OPA_80, 0);
    lv_obj_set_style_shadow_color(mainHud, lv_color_hex(strtoul(primaryColor + 1, NULL, 16)), 0);
    lv_obj_set_style_shadow_width(mainHud, 15, 0);
    lv_obj_set_style_shadow_opa(mainHud, LV_OPA_30, 0);
    
    // Create angled corners for the hexagonal HUD effect
    int cornerSize = hudHeight / 10;
    
    // Top left corner mask
    lv_obj_t* topLeftMask = lv_obj_create(mainHud);
    lv_obj_set_size(topLeftMask, cornerSize, cornerSize);
    lv_obj_set_pos(topLeftMask, 0, 0);
    lv_obj_set_style_bg_color(topLeftMask, lv_color_hex(strtoul(backgroundColor + 1, NULL, 16)), 0);
    lv_obj_set_style_bg_opa(topLeftMask, LV_OPA_COVER, 0);
    lv_obj_set_style_border_width(topLeftMask, 0, 0);
    
    // Bottom left corner mask
    lv_obj_t* bottomLeftMask = lv_obj_create(mainHud);
    lv_obj_set_size(bottomLeftMask, cornerSize, cornerSize);
    lv_obj_set_pos(bottomLeftMask, 0, hudHeight - cornerSize);
    lv_obj_set_style_bg_color(bottomLeftMask, lv_color_hex(strtoul(backgroundColor + 1, NULL, 16)), 0);
    lv_obj_set_style_bg_opa(bottomLeftMask, LV_OPA_COVER, 0);
    lv_obj_set_style_border_width(bottomLeftMask, 0, 0);
    
    // Top right corner mask
    lv_obj_t* topRightMask = lv_obj_create(mainHud);
    lv_obj_set_size(topRightMask, cornerSize, cornerSize);
    lv_obj_set_pos(topRightMask, hudWidth - cornerSize, 0);
    lv_obj_set_style_bg_color(topRightMask, lv_color_hex(strtoul(backgroundColor + 1, NULL, 16)), 0);
    lv_obj_set_style_bg_opa(topRightMask, LV_OPA_COVER, 0);
    lv_obj_set_style_border_width(topRightMask, 0, 0);
    
    // Bottom right corner mask
    lv_obj_t* bottomRightMask = lv_obj_create(mainHud);
    lv_obj_set_size(bottomRightMask, cornerSize, cornerSize);
    lv_obj_set_pos(bottomRightMask, hudWidth - cornerSize, hudHeight - cornerSize);
    lv_obj_set_style_bg_color(bottomRightMask, lv_color_hex(strtoul(backgroundColor + 1, NULL, 16)), 0);
    lv_obj_set_style_bg_opa(bottomRightMask, LV_OPA_COVER, 0);
    lv_obj_set_style_border_width(bottomRightMask, 0, 0);
    
    // Add diagonal lines to complete the hexagon look
    // Top-left diagonal
    lv_obj_t* tlDiagonal = lv_line_create(mainHud);
    lv_point_t tlPoints[2] = {{0, cornerSize}, {cornerSize, 0}};
    lv_line_set_points(tlDiagonal, tlPoints, 2);
    lv_obj_set_style_line_color(tlDiagonal, lv_color_hex(strtoul(primaryColor + 1, NULL, 16)), 0);
    lv_obj_set_style_line_width(tlDiagonal, 2, 0);
    lv_obj_set_style_line_opa(tlDiagonal, LV_OPA_80, 0);
    
    // Bottom-left diagonal
    lv_obj_t* blDiagonal = lv_line_create(mainHud);
    lv_point_t blPoints[2] = {{0, hudHeight - cornerSize}, {cornerSize, hudHeight}};
    lv_line_set_points(blDiagonal, blPoints, 2);
    lv_obj_set_style_line_color(blDiagonal, lv_color_hex(strtoul(primaryColor + 1, NULL, 16)), 0);
    lv_obj_set_style_line_width(blDiagonal, 2, 0);
    lv_obj_set_style_line_opa(blDiagonal, LV_OPA_80, 0);
    
    // Top-right diagonal
    lv_obj_t* trDiagonal = lv_line_create(mainHud);
    lv_point_t trPoints[2] = {{hudWidth - cornerSize, 0}, {hudWidth, cornerSize}};
    lv_line_set_points(trDiagonal, trPoints, 2);
    lv_obj_set_style_line_color(trDiagonal, lv_color_hex(strtoul(primaryColor + 1, NULL, 16)), 0);
    lv_obj_set_style_line_width(trDiagonal, 2, 0);
    lv_obj_set_style_line_opa(trDiagonal, LV_OPA_80, 0);
    
    // Bottom-right diagonal
    lv_obj_t* brDiagonal = lv_line_create(mainHud);
    lv_point_t brPoints[2] = {{hudWidth - cornerSize, hudHeight}, {hudWidth, hudHeight - cornerSize}};
    lv_line_set_points(brDiagonal, brPoints, 2);
    lv_obj_set_style_line_color(brDiagonal, lv_color_hex(strtoul(primaryColor + 1, NULL, 16)), 0);
    lv_obj_set_style_line_width(brDiagonal, 2, 0);
    lv_obj_set_style_line_opa(brDiagonal, LV_OPA_80, 0);
    
    // ================ Create Header with Mission Info ================
    // Create futuristic header with animated scanner effect
    lv_obj_t* header = lv_obj_create(mainHud);
    lv_obj_set_size(header, hudWidth - 40, hudHeight / 8);
    lv_obj_align(header, LV_ALIGN_TOP_MID, 0, 20);
    
    lv_obj_set_style_bg_color(header, lv_color_hex(strtoul(detailColor + 1, NULL, 16)), 0);
    lv_obj_set_style_bg_opa(header, LV_OPA_10, 0);
    lv_obj_set_style_border_color(header, lv_color_hex(strtoul(secondaryColor + 1, NULL, 16)), 0);
    lv_obj_set_style_border_width(header, 2, 0);
    lv_obj_set_style_border_opa(header, LV_OPA_70, 0);
    
    // Add decorative elements to header
    for (int i = 0; i < 3; i++) {
        lv_obj_t* headerDeco = lv_obj_create(header);
        int decoSize = 8;
        lv_obj_set_size(headerDeco, decoSize, decoSize);
        lv_obj_align(headerDeco, LV_ALIGN_LEFT_MID, 10 + i * (decoSize + 5), 0);
        lv_obj_set_style_radius(headerDeco, 1, 0); // Slightly rounded
        lv_obj_set_style_bg_color(headerDeco, lv_color_hex(strtoul(highlightColor + 1, NULL, 16)), 0);
        lv_obj_set_style_bg_opa(headerDeco, LV_OPA_80, 0);
        lv_obj_set_style_border_width(headerDeco, 0, 0);
    }
    
    // Create system status indicator
    lv_obj_t* statusIndicator = lv_led_create(header);
    lv_obj_set_size(statusIndicator, 12, 12);
    lv_obj_align(statusIndicator, LV_ALIGN_RIGHT_MID, -15, 0);
    lv_led_set_color(statusIndicator, lv_color_hex(strtoul(highlightColor + 1, NULL, 16)));
    lv_led_set_brightness(statusIndicator, 255); // Full brightness
    lv_led_on(statusIndicator);
    
    // Create mission title with tech font
    const char* missionTitle = configDoc["lvgl_astro"]["mission_title"] | "DEEP SPACE SURVEY";
    const char* missionId = configDoc["lvgl_astro"]["mission_id"] | "XR-7291";
    
    lv_obj_t* titleLabel = lv_label_create(header);
    lv_obj_set_style_text_color(titleLabel, lv_color_hex(strtoul(primaryColor + 1, NULL, 16)), 0);
    lv_obj_set_style_text_font(titleLabel, &lv_font_montserrat_22, 0);
    lv_label_set_text_fmt(titleLabel, "%s :: %s", missionTitle, missionId);
    lv_obj_align(titleLabel, LV_ALIGN_CENTER, 0, 0);
    
    // Scanner line animation effect (horizontal line that moves across the header)
    lv_obj_t* scanLine = lv_obj_create(header);
    lv_obj_set_size(scanLine, lv_obj_get_width(header), 2);
    lv_obj_set_style_bg_color(scanLine, lv_color_hex(strtoul(primaryColor + 1, NULL, 16)), 0);
    lv_obj_set_style_bg_opa(scanLine, LV_OPA_50, 0);
    lv_obj_set_style_border_width(scanLine, 0, 0);
    
    // Create animation for scanner effect
    lv_anim_t scanAnim;
    lv_anim_init(&scanAnim);
    lv_anim_set_var(&scanAnim, scanLine);
    lv_anim_set_values(&scanAnim, 0, lv_obj_get_height(header) - 2);
    lv_anim_set_time(&scanAnim, 2000); // 2 seconds
    lv_anim_set_exec_cb(&scanAnim, [](void* var, int32_t v) {
        lv_obj_set_y((lv_obj_t*)var, v);
    });
    lv_anim_set_repeat_count(&scanAnim, LV_ANIM_REPEAT_INFINITE);
    lv_anim_set_repeat_delay(&scanAnim, 0);
    lv_anim_start(&scanAnim);
    
    // ================ Create Main Sensor Display ================
    // Create advanced sensor visualization area
    lv_obj_t* sensorDisplay = lv_obj_create(mainHud);
    int displayWidth = hudWidth - 40;
    int displayHeight = (hudHeight * 6) / 10;
    lv_obj_set_size(sensorDisplay, displayWidth, displayHeight);
    lv_obj_align_to(sensorDisplay, header, LV_ALIGN_OUT_BOTTOM_MID, 0, 10);
    
    lv_obj_set_style_bg_color(sensorDisplay, lv_color_hex(strtoul(backgroundColor + 1, NULL, 16)), 0);
    lv_obj_set_style_bg_opa(sensorDisplay, LV_OPA_80, 0);
    lv_obj_set_style_border_color(sensorDisplay, lv_color_hex(strtoul(primaryColor + 1, NULL, 16)), 0);
    lv_obj_set_style_border_width(sensorDisplay, 1, 0);
    
    // Create a holographic grid pattern
    int gridCells = 20; // More dense grid
    
    // Draw vertical grid lines
    for (int i = 0; i <= gridCells; i++) {
        int xPos = (i * displayWidth) / gridCells;
        
        lv_obj_t* vLine = lv_line_create(sensorDisplay);
        lv_point_t vPoints[2] = {{xPos, 0}, {xPos, displayHeight}};
        lv_line_set_points(vLine, vPoints, 2);
        
        // Make some lines brighter than others
        lv_opa_t lineOpacity = (i % 5 == 0) ? LV_OPA_30 : LV_OPA_10;
        lv_obj_set_style_line_color(vLine, lv_color_hex(strtoul(gridColor + 1, NULL, 16)), 0);
        lv_obj_set_style_line_width(vLine, (i % 5 == 0) ? 2 : 1, 0);
        lv_obj_set_style_line_opa(vLine, lineOpacity, 0);
    }
    
    // Draw horizontal grid lines
    for (int i = 0; i <= gridCells; i++) {
        int yPos = (i * displayHeight) / gridCells;
        
        lv_obj_t* hLine = lv_line_create(sensorDisplay);
        lv_point_t hPoints[2] = {{0, yPos}, {displayWidth, yPos}};
        lv_line_set_points(hLine, hPoints, 2);
        
        // Make some lines brighter than others
        lv_opa_t lineOpacity = (i % 5 == 0) ? LV_OPA_30 : LV_OPA_10;
        lv_obj_set_style_line_color(hLine, lv_color_hex(strtoul(gridColor + 1, NULL, 16)), 0);
        lv_obj_set_style_line_width(hLine, (i % 5 == 0) ? 2 : 1, 0);
        lv_obj_set_style_line_opa(hLine, lineOpacity, 0);
    }
    
    // Create advanced targeting system with concentric circles and dynamic markers
    int centerX = displayWidth / 2;
    int centerY = displayHeight / 2;
    
    // Create concentric circles
    for (int i = 1; i <= 4; i++) {
        int radius = (i * displayWidth) / 10;
        
        lv_obj_t* targetRing = lv_arc_create(sensorDisplay);
        lv_obj_set_size(targetRing, radius * 2, radius * 2);
        lv_obj_center(targetRing);
        
        lv_arc_set_bg_angles(targetRing, 0, 360); // Full circle
        lv_arc_set_rotation(targetRing, 0);
        lv_arc_set_angles(targetRing, 0, 0); // No foreground arc
        
        // Style the rings with decreasing opacity
        lv_obj_set_style_arc_width(targetRing, i % 2 == 0 ? 2 : 1, LV_PART_MAIN);
        lv_obj_set_style_arc_color(targetRing, lv_color_hex(strtoul(primaryColor + 1, NULL, 16)), LV_PART_MAIN);
        lv_obj_set_style_arc_opa(targetRing, LV_OPA_50 - (i * 10), LV_PART_MAIN);
        
        // Remove the knob
        lv_obj_remove_style(targetRing, NULL, LV_PART_KNOB);
    }
    
    // Create targeting display with crosshairs
    // Horizontal crosshair
    lv_obj_t* hCrosshair = lv_line_create(sensorDisplay);
    lv_point_t hCrossPoints[2] = {{centerX - 30, centerY}, {centerX + 30, centerY}};
    lv_line_set_points(hCrosshair, hCrossPoints, 2);
    lv_obj_set_style_line_color(hCrosshair, lv_color_hex(strtoul(secondaryColor + 1, NULL, 16)), 0);
    lv_obj_set_style_line_width(hCrosshair, 2, 0);
    lv_obj_set_style_line_opa(hCrosshair, LV_OPA_80, 0);
    
    // Vertical crosshair
    lv_obj_t* vCrosshair = lv_line_create(sensorDisplay);
    lv_point_t vCrossPoints[2] = {{centerX, centerY - 30}, {centerX, centerY + 30}};
    lv_line_set_points(vCrosshair, vCrossPoints, 2);
    lv_obj_set_style_line_color(vCrosshair, lv_color_hex(strtoul(secondaryColor + 1, NULL, 16)), 0);
    lv_obj_set_style_line_width(vCrosshair, 2, 0);
    lv_obj_set_style_line_opa(vCrosshair, LV_OPA_80, 0);
    
    // Create advanced targeting brackets with animated corners
    std::vector<lv_obj_t*> targetingCorners;
    
    // Function to create a corner bracket
    auto createCorner = [&](int x, int y, int width, int height, bool leftSide, bool topSide) {
        lv_obj_t* corner = lv_obj_create(sensorDisplay);
        lv_obj_set_style_bg_opa(corner, LV_OPA_TRANSP, 0);
        lv_obj_set_style_border_width(corner, 3, 0);
        lv_obj_set_style_border_color(corner, lv_color_hex(strtoul(secondaryColor + 1, NULL, 16)), 0);
        
        // Set which sides of the border to show
        lv_border_side_t sides = 0;
        if (leftSide) sides |= LV_BORDER_SIDE_LEFT;
        else sides |= LV_BORDER_SIDE_RIGHT;
        
        if (topSide) sides |= LV_BORDER_SIDE_TOP;
        else sides |= LV_BORDER_SIDE_BOTTOM;
        
        lv_obj_set_style_border_side(corner, sides, 0);
        lv_obj_set_size(corner, width, height);
        lv_obj_set_pos(corner, x, y);
        
        return corner;
    };
    
    // Size of target brackets
    int bracketSize = displayWidth / 10;
    
    // Top-left
    targetingCorners.push_back(createCorner(
        centerX - bracketSize, centerY - bracketSize, 
        bracketSize / 2, bracketSize / 2, 
        true, true
    ));
    
    // Top-right
    targetingCorners.push_back(createCorner(
        centerX + bracketSize / 2, centerY - bracketSize, 
        bracketSize / 2, bracketSize / 2, 
        false, true
    ));
    
    // Bottom-left
    targetingCorners.push_back(createCorner(
        centerX - bracketSize, centerY + bracketSize / 2, 
        bracketSize / 2, bracketSize / 2, 
        true, false
    ));
    
    // Bottom-right
    targetingCorners.push_back(createCorner(
        centerX + bracketSize / 2, centerY + bracketSize / 2, 
        bracketSize / 2, bracketSize / 2, 
        false, false
    ));
    
    // Create pulsing animation for targeting corners
    for (lv_obj_t* corner : targetingCorners) {
        lv_anim_t cornerAnim;
        lv_anim_init(&cornerAnim);
        lv_anim_set_var(&cornerAnim, corner);
        lv_anim_set_values(&cornerAnim, LV_OPA_30, LV_OPA_100);
        lv_anim_set_time(&cornerAnim, 1500 + random(0, 1000)); // Slightly different timing
        lv_anim_set_exec_cb(&cornerAnim, [](void* var, int32_t v) {
            lv_obj_set_style_border_opa((lv_obj_t*)var, v, 0);
        });
        lv_anim_set_repeat_count(&cornerAnim, LV_ANIM_REPEAT_INFINITE);
        lv_anim_set_path_cb(&cornerAnim, lv_anim_path_ease_in_out);
        lv_anim_start(&cornerAnim);
    }
    
    // Create dynamic targeting point in center
    lv_obj_t* targetPoint = lv_obj_create(sensorDisplay);
    lv_obj_set_size(targetPoint, 12, 12);
    lv_obj_center(targetPoint);
    lv_obj_set_style_radius(targetPoint, LV_RADIUS_CIRCLE, 0);
    lv_obj_set_style_bg_color(targetPoint, lv_color_hex(strtoul(secondaryColor + 1, NULL, 16)), 0);
    lv_obj_set_style_bg_opa(targetPoint, LV_OPA_70, 0);
    lv_obj_set_style_border_width(targetPoint, 2, 0);
    lv_obj_set_style_border_color(targetPoint, lv_color_hex(strtoul(highlightColor + 1, NULL, 16)), 0);
    
    // Pulse animation for target point
    lv_anim_t pulseAnim;
    lv_anim_init(&pulseAnim);
    lv_anim_set_var(&pulseAnim, targetPoint);
    lv_anim_set_values(&pulseAnim, 8, 14); // Size variation
    lv_anim_set_time(&pulseAnim, 2000);
    lv_anim_set_exec_cb(&pulseAnim, [](void* var, int32_t v) {
        lv_obj_set_size((lv_obj_t*)var, v, v);
        lv_obj_center((lv_obj_t*)var);
    });
    lv_anim_set_repeat_count(&pulseAnim, LV_ANIM_REPEAT_INFINITE);
    lv_anim_set_path_cb(&pulseAnim, lv_anim_path_ease_in_out);
    lv_anim_start(&pulseAnim);
    
    // Add decorative sensor stats and technical data around the display
    // Coordinate markers along edges
    for (int i = 1; i < 4; i++) {
        // X-axis markers
        int xPos = (i * displayWidth) / 4;
        char xCoord[16];
        snprintf(xCoord, sizeof(xCoord), "%d.%d", random(10, 99), random(0, 99));
        
        lv_obj_t* xMarker = lv_label_create(sensorDisplay);
        lv_obj_set_style_text_color(xMarker, lv_color_hex(strtoul(primaryColor + 1, NULL, 16)), 0);
        lv_obj_set_style_text_font(xMarker, &lv_font_montserrat_12, 0);
        lv_label_set_text(xMarker, xCoord);
        lv_obj_align(xMarker, LV_ALIGN_TOP_LEFT, xPos, 5);
        
        // Y-axis markers
        int yPos = (i * displayHeight) / 4;
        char yCoord[16];
        snprintf(yCoord, sizeof(yCoord), "%d.%d", random(10, 99), random(0, 99));
        
        lv_obj_t* yMarker = lv_label_create(sensorDisplay);
        lv_obj_set_style_text_color(yMarker, lv_color_hex(strtoul(primaryColor + 1, NULL, 16)), 0);
        lv_obj_set_style_text_font(yMarker, &lv_font_montserrat_12, 0);
        lv_label_set_text(yMarker, yCoord);
        lv_obj_align(yMarker, LV_ALIGN_TOP_LEFT, 5, yPos);
    }
    
    // Create tech readout label with scrolling data
    lv_obj_t* techReadout = lv_label_create(sensorDisplay);
    lv_obj_set_width(techReadout, displayWidth - 20);
    lv_obj_set_style_text_color(techReadout, lv_color_hex(strtoul(detailColor + 1, NULL, 16)), 0);
    lv_obj_set_style_text_font(techReadout, &lv_font_montserrat_12, 0);
    lv_obj_set_style_text_opa(techReadout, LV_OPA_70, 0);
    
    // Create scrolling technical readout text
    char techText[256];
    snprintf(techText, sizeof(techText), 
             "SCANNING: SECTOR %d-%d | QUANTUM FLUX: %d.%02d | TACHYON EMISSIONS: %d.%02d | GRAVITATIONAL VARIANCE: %d.%02d | RADIATION LEVELS: %d.%02d",
             random(10, 99), random(100, 999),
             random(10, 99), random(0, 99),
             random(10, 99), random(0, 99),
             random(5, 20), random(0, 99),
             random(1, 10), random(0, 99));
    
    lv_label_set_text(techReadout, techText);
    lv_obj_align(techReadout, LV_ALIGN_BOTTOM_MID, 0, -10);
    
    // Create the label scroller animation (tech readout scrolling effect)
    lv_anim_t readoutAnim;
    lv_anim_init(&readoutAnim);
    lv_anim_set_var(&readoutAnim, techReadout);
    lv_anim_set_values(&readoutAnim, 0, -500); // Scroll distance
    lv_anim_set_time(&readoutAnim, 15000); // 15 seconds to scroll
    lv_anim_set_exec_cb(&readoutAnim, [](void* var, int32_t v) {
        lv_obj_set_x((lv_obj_t*)var, v);
    });
    lv_anim_set_repeat_count(&readoutAnim, LV_ANIM_REPEAT_INFINITE);
    lv_anim_set_repeat_delay(&readoutAnim, 1000);
    lv_anim_start(&readoutAnim);
    
    // Create simulated sensor points (dots that move around display)
    std::vector<lv_obj_t*> sensorDots;
    int dotCount = 5;
    
    for (int i = 0; i < dotCount; i++) {
        lv_obj_t* dot = lv_obj_create(sensorDisplay);
        int dotSize = random(3, 7);
        lv_obj_set_size(dot, dotSize, dotSize);
        lv_obj_set_style_radius(dot, LV_RADIUS_CIRCLE, 0);
        
        // Random dot colors
        uint32_t dotColors[] = {
            strtoul(primaryColor + 1, NULL, 16),
            strtoul(secondaryColor + 1, NULL, 16),
            strtoul(highlightColor + 1, NULL, 16)
        };
        
        lv_obj_set_style_bg_color(dot, lv_color_hex(dotColors[random(0, 3)]), 0);
        lv_obj_set_style_bg_opa(dot, LV_OPA_70, 0);
        lv_obj_set_style_border_width(dot, 0, 0);
        
        // Position dots randomly on the display
        int xPos = random(dotSize, displayWidth - dotSize);
        int yPos = random(dotSize, displayHeight - dotSize);
        lv_obj_set_pos(dot, xPos, yPos);
        
        sensorDots.push_back(dot);
        
        // Create random movement animations for the dots
        lv_anim_t dotAnim;
        lv_anim_init(&dotAnim);
        lv_anim_set_var(&dotAnim, dot);
        
        // Pick random X or Y movement
        if (random(0, 2) == 0) {
            // X-axis movement
            int startX = xPos;
            int endX = random(dotSize, displayWidth - dotSize);
            lv_anim_set_values(&dotAnim, startX, endX);
            lv_anim_set_exec_cb(&dotAnim, [](void* var, int32_t v) {
                lv_obj_set_x((lv_obj_t*)var, v);
            });
        } else {
            // Y-axis movement
            int startY = yPos;
            int endY = random(dotSize, displayHeight - dotSize);
            lv_anim_set_values(&dotAnim, startY, endY);
            lv_anim_set_exec_cb(&dotAnim, [](void* var, int32_t v) {
                lv_obj_set_y((lv_obj_t*)var, v);
            });
        }
        
        lv_anim_set_time(&dotAnim, random(3000, 8000)); // Random duration
        lv_anim_set_repeat_count(&dotAnim, LV_ANIM_REPEAT_INFINITE);
        lv_anim_set_repeat_delay(&dotAnim, random(0, 1000));
        lv_anim_set_path_cb(&dotAnim, lv_anim_path_ease_in_out);
        lv_anim_start(&dotAnim);
    }
    
    // ================ Create Bottom Sensor Data Panel ================
    // Bottom panel for live sensor data with cool visualization
    lv_obj_t* sensorPanel = lv_obj_create(mainHud);
    int panelHeight = hudHeight / 6;
    lv_obj_set_size(sensorPanel, hudWidth - 40, panelHeight);
    lv_obj_align_to(sensorPanel, sensorDisplay, LV_ALIGN_OUT_BOTTOM_MID, 0, 10);
    
    lv_obj_set_style_bg_color(sensorPanel, lv_color_hex(strtoul(backgroundColor + 1, NULL, 16)), 0);
    lv_obj_set_style_bg_opa(sensorPanel, LV_OPA_70, 0);
    lv_obj_set_style_border_color(sensorPanel, lv_color_hex(strtoul(secondaryColor + 1, NULL, 16)), 0);
    lv_obj_set_style_border_width(sensorPanel, 2, 0);
    
    // Add stylish angle cut on left side
    lv_obj_t* leftCut = lv_obj_create(sensorPanel);
    int cutSize = panelHeight / 2;
    lv_obj_set_size(leftCut, cutSize, panelHeight);
    lv_obj_set_pos(leftCut, 0, 0);
    lv_obj_set_style_bg_color(leftCut, lv_color_hex(strtoul(backgroundColor + 1, NULL, 16)), 0);
    lv_obj_set_style_bg_opa(leftCut, LV_OPA_COVER, 0);
    lv_obj_set_style_border_width(leftCut, 0, 0);
    
    // Add diagonal line for the cut
    lv_obj_t* cutLine = lv_line_create(sensorPanel);
    lv_point_t cutPoints[2] = {{cutSize, 0}, {0, panelHeight}};
    lv_line_set_points(cutLine, cutPoints, 2);
    lv_obj_set_style_line_color(cutLine, lv_color_hex(strtoul(secondaryColor + 1, NULL, 16)), 0);
    lv_obj_set_style_line_width(cutLine, 2, 0);
    
    // Create a flex container for sensor readouts
    lv_obj_t* sensorContainer = lv_obj_create(sensorPanel);
    lv_obj_remove_style_all(sensorContainer);
    lv_obj_set_size(sensorContainer, hudWidth - 40 - cutSize - 10, panelHeight - 10);
    lv_obj_align(sensorContainer, LV_ALIGN_RIGHT_MID, -5, 0);
    
    lv_obj_set_flex_flow(sensorContainer, LV_FLEX_FLOW_ROW);
    lv_obj_set_flex_align(sensorContainer, LV_FLEX_ALIGN_SPACE_EVENLY, LV_FLEX_ALIGN_CENTER, LV_FLEX_ALIGN_CENTER);
    
    // Create dynamic document for the layout
    static DynamicJsonDocument layoutDoc(4096);
    
    // Determine if layout is an array or a string that needs parsing
    bool isLayoutString = false;
    
    if (configDoc["layout"].is<JsonArray>()) {
        // If layout is already an array, just copy it
        layoutDoc.clear();
        layoutDoc.set(configDoc["layout"]);
        Serial.println("[DEBUG] Layout is a valid JSON array");
    } else if (configDoc["layout"].is<const char*>()) {
        // If layout is a string, try to parse it
        layoutDoc.clear();
        String layoutStr = configDoc["layout"].as<String>();
        
        DeserializationError error = deserializeJson(layoutDoc, layoutStr);
        if (error) {
            Serial.printf("[ERROR] Failed to parse layout string: %s\n", error.c_str());
            // Create an empty array in case of parsing failure
            layoutDoc.to<JsonArray>();
        } else {
            Serial.println("[DEBUG] Successfully parsed layout string to JSON array");
            isLayoutString = true;
        }
    } else {
        // If layout is neither an array nor a string, create an empty array
        Serial.println("[WARN] Layout is neither a valid array nor a string");
        layoutDoc.to<JsonArray>();
    }
    
    // Now we can work with layoutDoc which contains our layout array
    JsonArray layoutArray = layoutDoc.as<JsonArray>();
    int sensorCount = layoutArray.size();
    Serial.printf("[DEBUG] Layout array has %d sensors\n", sensorCount);
    
    // Limit to 4 sensors maximum for this screen
    sensorCount = min(sensorCount, 4);
    
    // Reset sensor mapping
    sensorTagToIndex.clear();
    
    // Allocate memory for label arrays
    delete[] labelNames;
    delete[] labelValues;
    labelNames = new lv_obj_t*[sensorCount];
    labelValues = new lv_obj_t*[sensorCount];
    
    // Create futuristic sensor displays for each sensor in the layout
    for (int i = 0; i < sensorCount; i++) {
        JsonVariant sensorEntry = layoutArray[i];
        
        // Check if we have valid data
        if (sensorEntry.isNull()) {
            Serial.printf("[ERROR] Sensor entry at index %d is null\n", i);
            continue;
        }
        
        const char* sensorId = sensorEntry["id"];
        if (!sensorId) {
            Serial.printf("[ERROR] Sensor ID at index %d is missing\n", i);
            continue;
        }
        
        const char* sensorLabel = sensorEntry["label"] | sensorId;
        const char* sensorUnit = sensorEntry["unit"] | "";
        
        Serial.printf("[DEBUG] Processing sensor %d: id='%s', label='%s', unit='%s'\n",
                     i, sensorId, sensorLabel, sensorUnit);
        
        // Map sensor ID to index
        sensorTagToIndex[String(sensorId)] = i;
        Serial.printf("[DEBUG] Mapped sensor '%s' to index %d\n", sensorId, i);
        
        // Create a high-tech looking sensor box
        lv_obj_t* sensorBox = lv_obj_create(sensorContainer);
        int boxWidth = (lv_obj_get_width(sensorContainer) - 20) / sensorCount;
        lv_obj_set_size(sensorBox, boxWidth, panelHeight - 15);
        
        // Create hexagonal-style sensor display
        lv_obj_set_style_bg_color(sensorBox, lv_color_hex(strtoul(detailColor + 1, NULL, 16)), 0);
        lv_obj_set_style_bg_opa(sensorBox, LV_OPA_10, 0);
        lv_obj_set_style_border_color(sensorBox, lv_color_hex(strtoul(primaryColor + 1, NULL, 16)), 0);
        lv_obj_set_style_border_width(sensorBox, 2, 0);
        lv_obj_set_style_pad_all(sensorBox, 2, 0);
        
        // Add some decorative elements
        lv_obj_t* topBar = lv_obj_create(sensorBox);
        lv_obj_set_size(topBar, boxWidth - 4, 5);
        lv_obj_align(topBar, LV_ALIGN_TOP_MID, 0, 0);
        lv_obj_set_style_bg_color(topBar, lv_color_hex(strtoul(primaryColor + 1, NULL, 16)), 0);
        lv_obj_set_style_bg_opa(topBar, LV_OPA_50, 0);
        lv_obj_set_style_border_width(topBar, 0, 0);
        
        // Create stylish sensor name label
        lv_obj_t* nameLabel = lv_label_create(sensorBox);
        lv_obj_set_style_text_color(nameLabel, lv_color_hex(strtoul(highlightColor + 1, NULL, 16)), 0);
        lv_obj_set_style_text_font(nameLabel, &lv_font_montserrat_14, 0);
        
        // Shorten the sensor label if it's too long
        String shortLabel = String(sensorLabel);
        int lastSlash = shortLabel.lastIndexOf('/');
        if (lastSlash >= 0 && lastSlash < shortLabel.length() - 1) {
            shortLabel = shortLabel.substring(lastSlash + 1);
        }
        
        // Further shorten if needed by taking first word
        int firstSpace = shortLabel.indexOf(' ');
        if (firstSpace > 0 && firstSpace < shortLabel.length() - 1) {
            shortLabel = shortLabel.substring(0, firstSpace);
        }
        
        // Trim to max 10 chars
        if (shortLabel.length() > 10) {
            shortLabel = shortLabel.substring(0, 8) + "..";
        }
        
        lv_label_set_text(nameLabel, shortLabel.c_str());
        lv_obj_align(nameLabel, LV_ALIGN_TOP_MID, 0, 8);
        
        // Create mini visualization bar
        lv_obj_t* miniGraph = lv_bar_create(sensorBox);
        lv_obj_set_size(miniGraph, boxWidth - 15, 5);
        lv_obj_align(miniGraph, LV_ALIGN_CENTER, 0, 0);
        lv_obj_set_style_bg_color(miniGraph, lv_color_hex(strtoul(backgroundColor + 1, NULL, 16)), LV_PART_MAIN);
        lv_obj_set_style_bg_opa(miniGraph, LV_OPA_50, LV_PART_MAIN);
        
        lv_obj_set_style_bg_color(miniGraph, lv_color_hex(strtoul(primaryColor + 1, NULL, 16)), LV_PART_INDICATOR);
        lv_obj_set_style_bg_opa(miniGraph, LV_OPA_70, LV_PART_INDICATOR);
        
        // Set initial random value
        lv_bar_set_range(miniGraph, 0, 100);
        lv_bar_set_value(miniGraph, random(30, 70), LV_ANIM_OFF);
        
        // Create animated mini bar
        lv_anim_t barAnim;
        lv_anim_init(&barAnim);
        lv_anim_set_var(&barAnim, miniGraph);
        lv_anim_set_values(&barAnim, 30, 70); // Range of values
        lv_anim_set_time(&barAnim, 3000 + i * 500); // Different timing for each
        lv_anim_set_exec_cb(&barAnim, [](void* var, int32_t v) {
            lv_bar_set_value((lv_obj_t*)var, v, LV_ANIM_OFF);
        });
        lv_anim_set_repeat_count(&barAnim, LV_ANIM_REPEAT_INFINITE);
        lv_anim_set_path_cb(&barAnim, lv_anim_path_ease_in_out);
        lv_anim_start(&barAnim);
        
        // Create futuristic sensor value display
        lv_obj_t* valueLabel = lv_label_create(sensorBox);
        lv_obj_set_style_text_color(valueLabel, lv_color_hex(strtoul(primaryColor + 1, NULL, 16)), 0);
        lv_obj_set_style_text_font(valueLabel, &lv_font_montserrat_16, 0);
        
        // Initialize with placeholder
        char valueBuffer[32];
        snprintf(valueBuffer, sizeof(valueBuffer), "--.-- %s", sensorUnit);
        lv_label_set_text(valueLabel, valueBuffer);
        lv_obj_align(valueLabel, LV_ALIGN_BOTTOM_MID, 0, -5);
        
        // Store references to update later
        labelNames[i] = nameLabel;
        labelValues[i] = valueLabel;
        
        Serial.printf("[DEBUG] Created sensor UI for '%s' at index %d\n", sensorId, i);
        
        // Create blip objects in the main display that will move based on sensor data
        if (i < 4) {
            lv_obj_t* blip = lv_obj_create(sensorDisplay);
            lv_obj_set_size(blip, 10, 10);
            lv_obj_set_style_radius(blip, 5, 0); // Make it circular
            
            // Use different colors for each sensor blip
            uint32_t blipColors[] = {
                0x00FFBB, // Cyan
                0xFF3366, // Magenta
                0xFFCC00, // Amber
                0x00BBFF  // Blue
            };
            
            lv_obj_set_style_bg_color(blip, lv_color_hex(blipColors[i]), 0);
            lv_obj_set_style_bg_opa(blip, LV_OPA_80, 0);
            lv_obj_set_style_shadow_color(blip, lv_color_hex(blipColors[i]), 0);
            lv_obj_set_style_shadow_width(blip, 10, 0);
            lv_obj_set_style_shadow_opa(blip, LV_OPA_50, 0);
            
            // Set initial positions around center with some offset
            int angle = (i * 90) + random(-20, 20); // distribute around 360 degrees
            float rads = angle * 3.14159f / 180.0f;
            int radius = displayWidth / 5;
            
            int x = centerX + cos(rads) * radius;
            int y = centerY + sin(rads) * radius;
            
            lv_obj_set_pos(blip, x, y);
            
            // Store blip objects in user data for updates
            String blipTag = String("__blip_") + String(sensorId);
            astroBlipMap[blipTag] = blip;
            Serial.printf("[DEBUG] Created blip for sensor '%s' with tag '%s'\n", sensorId, blipTag.c_str());
        }
    }
    
    // ================ Create Side Control Panel ================
    // Create side panel with additional controls and data
    lv_obj_t* sidePanel = lv_obj_create(mainHud);
    int sidePanelWidth = hudWidth / 6;
    lv_obj_set_size(sidePanel, sidePanelWidth, displayHeight);
    lv_obj_align_to(sidePanel, sensorDisplay, LV_ALIGN_OUT_RIGHT_MID, 10, 0);
    
    lv_obj_set_style_bg_color(sidePanel, lv_color_hex(strtoul(backgroundColor + 1, NULL, 16)), 0);
    lv_obj_set_style_bg_opa(sidePanel, LV_OPA_70, 0);
    lv_obj_set_style_border_color(sidePanel, lv_color_hex(strtoul(primaryColor + 1, NULL, 16)), 0);
    lv_obj_set_style_border_width(sidePanel, 1, 0);
    
    // Create vertical tabs/sections in side panel
    const int sections = 5;
    for (int i = 0; i < sections; i++) {
        lv_obj_t* section = lv_obj_create(sidePanel);
        lv_obj_set_size(section, sidePanelWidth - 10, (displayHeight - 20) / sections);
        lv_obj_align(section, LV_ALIGN_TOP_MID, 0, 5 + i * ((displayHeight - 20) / sections + 2));
        
        lv_obj_set_style_bg_color(section, lv_color_hex(strtoul(primaryColor + 1, NULL, 16)), 0);
        lv_obj_set_style_bg_opa(section, LV_OPA_10, 0);
        lv_obj_set_style_border_color(section, lv_color_hex(strtoul(primaryColor + 1, NULL, 16)), 0);
        lv_obj_set_style_border_width(section, 1, 0);
        lv_obj_set_style_pad_all(section, 2, 0);
        
        // Add section label
        lv_obj_t* sectionLabel = lv_label_create(section);
        lv_obj_set_style_text_color(sectionLabel, lv_color_hex(strtoul(primaryColor + 1, NULL, 16)), 0);
        lv_obj_set_style_text_font(sectionLabel, &lv_font_montserrat_12, 0);
        
        // Generate futuristic section names
        const char* sectionNames[] = {
            "NAV SYS", "COMM", "SENSORS", "ENV CTL", "POWER"
        };
        
        lv_label_set_text(sectionLabel, sectionNames[i]);
        lv_obj_align(sectionLabel, LV_ALIGN_TOP_MID, 0, 2);
        
        // Add section indicator value
        lv_obj_t* sectionValue = lv_label_create(section);
        lv_obj_set_style_text_color(sectionValue, lv_color_hex(strtoul(secondaryColor + 1, NULL, 16)), 0);
        lv_obj_set_style_text_font(sectionValue, &lv_font_montserrat_16, 0);
        
        char valueText[16];
        snprintf(valueText, sizeof(valueText), "%d.%d", random(10, 99), random(0, 99));
        lv_label_set_text(sectionValue, valueText);
        lv_obj_align(sectionValue, LV_ALIGN_BOTTOM_MID, 0, -2);
        
        // Add a small decorative indicator light
        lv_obj_t* indicator = lv_obj_create(section);
        lv_obj_set_size(indicator, 6, 6);
        lv_obj_set_style_radius(indicator, LV_RADIUS_CIRCLE, 0);
        
        // Different colors for each indicator
        uint32_t indicatorColors[] = {
            strtoul(primaryColor + 1, NULL, 16),
            strtoul(secondaryColor + 1, NULL, 16),
            strtoul(highlightColor + 1, NULL, 16),
            strtoul(detailColor + 1, NULL, 16),
            0x00FF00 // Green
        };
        
        lv_obj_set_style_bg_color(indicator, lv_color_hex(indicatorColors[i]), 0);
        lv_obj_set_style_bg_opa(indicator, LV_OPA_80, 0);
        lv_obj_align(indicator, LV_ALIGN_TOP_RIGHT, -2, 2);
        
        // Blinking animation for indicators
        if (i % 2 == 0) { // Only animate some indicators
            lv_anim_t indAnim;
            lv_anim_init(&indAnim);
            lv_anim_set_var(&indAnim, indicator);
            lv_anim_set_values(&indAnim, LV_OPA_30, LV_OPA_80);
            lv_anim_set_time(&indAnim, 1000 + i * 500);
            lv_anim_set_exec_cb(&indAnim, [](void* var, int32_t v) {
                lv_obj_set_style_bg_opa((lv_obj_t*)var, v, 0);
            });
            lv_anim_set_repeat_count(&indAnim, LV_ANIM_REPEAT_INFINITE);
            lv_anim_start(&indAnim);
        }
    }
    
    // ================ Create Additional UI Elements ================
    // Add status display on bottom of screen
    lv_obj_t* statusBar = lv_obj_create(mainHud);
    lv_obj_set_size(statusBar, hudWidth - 40, 20);
    lv_obj_align(statusBar, LV_ALIGN_BOTTOM_MID, 0, -10);
    
    lv_obj_set_style_bg_color(statusBar, lv_color_hex(strtoul(backgroundColor + 1, NULL, 16)), 0);
    lv_obj_set_style_bg_opa(statusBar, LV_OPA_50, 0);
    lv_obj_set_style_border_color(statusBar, lv_color_hex(strtoul(detailColor + 1, NULL, 16)), 0);
    lv_obj_set_style_border_width(statusBar, 1, 0);
    lv_obj_set_style_border_opa(statusBar, LV_OPA_50, 0);
    
    // Add status text
    lv_obj_t* statusText = lv_label_create(statusBar);
    lv_obj_set_style_text_color(statusText, lv_color_hex(strtoul(primaryColor + 1, NULL, 16)), 0);
    lv_obj_set_style_text_font(statusText, &lv_font_montserrat_12, 0);
    
    const char* statusMessages[] = {
        "ALL SYSTEMS NOMINAL",
        "DEEP SPACE SURVEY IN PROGRESS",
        "TACHYON EMISSIONS DETECTED",
        "QUANTUM FIELD STABLE"
    };
    
    lv_label_set_text(statusText, statusMessages[random(0, 4)]);
    lv_obj_align(statusText, LV_ALIGN_LEFT_MID, 10, 0);
    
    // Add timestamp
    lv_obj_t* timestamp = lv_label_create(statusBar);
    lv_obj_set_style_text_color(timestamp, lv_color_hex(strtoul(primaryColor + 1, NULL, 16)), 0);
    lv_obj_set_style_text_font(timestamp, &lv_font_montserrat_12, 0);
    
    char timeText[32];
    snprintf(timeText, sizeof(timeText), "T+%02d:%02d:%02d", random(0, 24), random(0, 60), random(0, 60));
    lv_label_set_text(timestamp, timeText);
    lv_obj_align(timestamp, LV_ALIGN_RIGHT_MID, -10, 0);
    
    // Add flashing alert indicator
    lv_obj_t* alertIndicator = lv_obj_create(statusBar);
    lv_obj_set_size(alertIndicator, 8, 8);
    lv_obj_set_style_radius(alertIndicator, LV_RADIUS_CIRCLE, 0);
    lv_obj_set_style_bg_color(alertIndicator, lv_color_hex(strtoul(secondaryColor + 1, NULL, 16)), 0);
    lv_obj_set_style_bg_opa(alertIndicator, LV_OPA_80, 0);
    lv_obj_align(alertIndicator, LV_ALIGN_CENTER, 0, 0);
    
    // Create blinking animation for alert
    lv_anim_t alertAnim;
    lv_anim_init(&alertAnim);
    lv_anim_set_var(&alertAnim, alertIndicator);
    lv_anim_set_values(&alertAnim, LV_OPA_0, LV_OPA_80);
    lv_anim_set_time(&alertAnim, 1000);
    lv_anim_set_exec_cb(&alertAnim, [](void* var, int32_t v) {
        lv_obj_set_style_bg_opa((lv_obj_t*)var, v, 0);
    });
    lv_anim_set_repeat_count(&alertAnim, LV_ANIM_REPEAT_INFINITE);
    lv_anim_start(&alertAnim);
    
    // ================ Create Decorative Interface Elements ================
    // Add technological-looking corner elements to emphasize sci-fi look
    auto createCornerElement = [&](int x, int y, int size, bool flipH, bool flipV) {
        lv_obj_t* corner = lv_obj_create(mainHud);
        lv_obj_set_size(corner, size, size);
        lv_obj_set_pos(corner, x, y);
        
        // Create the right-angle element
        lv_obj_set_style_bg_color(corner, lv_color_hex(strtoul(backgroundColor + 1, NULL, 16)), 0);
        lv_obj_set_style_bg_opa(corner, LV_OPA_TRANSP, 0);
        lv_obj_set_style_border_width(corner, 0, 0);
        
        // Horizontal line
        lv_obj_t* hLine = lv_obj_create(corner);
        lv_obj_set_size(hLine, size, 2);
        lv_obj_set_style_bg_color(hLine, lv_color_hex(strtoul(highlightColor + 1, NULL, 16)), 0);
        lv_obj_set_style_bg_opa(hLine, LV_OPA_70, 0);
        lv_obj_set_style_border_width(hLine, 0, 0);
        
        // Vertical line
        lv_obj_t* vLine = lv_obj_create(corner);
        lv_obj_set_size(vLine, 2, size);
        lv_obj_set_style_bg_color(vLine, lv_color_hex(strtoul(highlightColor + 1, NULL, 16)), 0);
        lv_obj_set_style_bg_opa(vLine, LV_OPA_70, 0);
        lv_obj_set_style_border_width(vLine, 0, 0);
        
        // Position the lines based on the flipping
        if (!flipH && !flipV) {
            // Top-left corner
            lv_obj_align(hLine, LV_ALIGN_TOP_LEFT, 0, 0);
            lv_obj_align(vLine, LV_ALIGN_TOP_LEFT, 0, 0);
        } else if (flipH && !flipV) {
            // Top-right corner
            lv_obj_align(hLine, LV_ALIGN_TOP_RIGHT, 0, 0);
            lv_obj_align(vLine, LV_ALIGN_TOP_RIGHT, -size + 2, 0);
        } else if (!flipH && flipV) {
            // Bottom-left corner
            lv_obj_align(hLine, LV_ALIGN_BOTTOM_LEFT, 0, 0);
            lv_obj_align(vLine, LV_ALIGN_BOTTOM_LEFT, 0, -size + 2);
        } else {
            // Bottom-right corner
            lv_obj_align(hLine, LV_ALIGN_BOTTOM_RIGHT, 0, 0);
            lv_obj_align(vLine, LV_ALIGN_BOTTOM_RIGHT, -size + 2, -size + 2);
        }
        
        // Add ornamental dots
        for (int i = 0; i < 3; i++) {
            lv_obj_t* dot = lv_obj_create(corner);
            int dotSize = 3;
            lv_obj_set_size(dot, dotSize, dotSize);
            lv_obj_set_style_radius(dot, LV_RADIUS_CIRCLE, 0);
            lv_obj_set_style_bg_color(dot, lv_color_hex(strtoul(primaryColor + 1, NULL, 16)), 0);
            lv_obj_set_style_bg_opa(dot, LV_OPA_80, 0);
            lv_obj_set_style_border_width(dot, 0, 0);
            
            // Position dots based on corner type
            if (!flipH && !flipV) {
                // Top-left corner
                lv_obj_set_pos(dot, (i+1) * size/4, 2);
            } else if (flipH && !flipV) {
                // Top-right corner
                lv_obj_set_pos(dot, size - (i+1) * size/4 - dotSize, 2);
            } else if (!flipH && flipV) {
                // Bottom-left corner
                lv_obj_set_pos(dot, (i+1) * size/4, size - dotSize - 2);
            } else {
                // Bottom-right corner
                lv_obj_set_pos(dot, size - (i+1) * size/4 - dotSize, size - dotSize - 2);
            }
        }
    };
    
    // Create the corner elements
    int cornerDecoration = hudWidth / 14; // Different variable name to avoid redeclaration
    createCornerElement(20, 20, cornerDecoration, false, false);                               // Top-left
    createCornerElement(hudWidth - 20 - cornerDecoration, 20, cornerDecoration, true, false);        // Top-right
    createCornerElement(20, hudHeight - 20 - cornerDecoration, cornerDecoration, false, true);       // Bottom-left
    createCornerElement(hudWidth - 20 - cornerDecoration, hudHeight - 20 - cornerDecoration, cornerDecoration, true, true); // Bottom-right
    
    // Add decorative circles scattered around the interface for visual flair
    for (int i = 0; i < 10; i++) {
        // Calculate positions avoiding the main components
        int margin = 10;
        int x, y;
        bool validPos;
        
        do {
            validPos = true;
            x = random(margin, hudWidth - margin);
            y = random(margin, hudHeight - margin);
            
            // Check if position overlaps with main components
            if (x > 20 && x < hudWidth - 20 && y > 20 && y < hudHeight - 20) {
                // Too close to center - try again
                validPos = false;
            }
        } while (!validPos);
        
        // Create decorative dot
        lv_obj_t* decoDot = lv_obj_create(mainHud);
        int dotSize = random(3, 6);
        lv_obj_set_size(decoDot, dotSize, dotSize);
        lv_obj_set_style_radius(decoDot, LV_RADIUS_CIRCLE, 0);
        
        // Random dot colors
        uint32_t dotColors[] = {
            strtoul(primaryColor + 1, NULL, 16),
            strtoul(secondaryColor + 1, NULL, 16),
            strtoul(highlightColor + 1, NULL, 16)
        };
        
        lv_obj_set_style_bg_color(decoDot, lv_color_hex(dotColors[random(0, 3)]), 0);
        lv_obj_set_style_bg_opa(decoDot, LV_OPA_50 + random(0, 50), 0);
        lv_obj_set_style_border_width(decoDot, 0, 0);
        lv_obj_set_pos(decoDot, x, y);
        
        // Optional: Add blinking animation to some dots
        if (random(0, 3) == 0) {
            lv_anim_t dotAnim;
            lv_anim_init(&dotAnim);
            lv_anim_set_var(&dotAnim, decoDot);
            lv_anim_set_values(&dotAnim, LV_OPA_30, LV_OPA_80);
            lv_anim_set_time(&dotAnim, 1000 + random(0, 2000));
            lv_anim_set_exec_cb(&dotAnim, [](void* var, int32_t v) {
                lv_obj_set_style_bg_opa((lv_obj_t*)var, v, 0);
            });
            lv_anim_set_repeat_count(&dotAnim, LV_ANIM_REPEAT_INFINITE);
            lv_anim_start(&dotAnim);
        }
    }
    
    // ================ Finalize Interface Creation ================
    // Load screen
    lv_scr_load(scr);
    lv_task_handler();
    
    Serial.printf("[DEBUG] Free heap after creating futuristic interface: %d bytes\n", ESP.getFreeHeap());
    Serial.printf("[DEBUG] Min free heap: %d bytes\n", ESP.getMinFreeHeap());
    Serial.println("[DEBUG] Created advanced sci-fi AstroScreen interface");
}

// Method to update sensor data in the sci-fi display
void DisplayManager::updateAstroSensorData(const char* sensorTag, float value) {
    // Find the sensor index
    auto it = sensorTagToIndex.find(String(sensorTag));
    if (it == sensorTagToIndex.end()) {
        Serial.printf("[WARN] Could not find sensor '%s' in mapping\n", sensorTag);
        return;
    }
    
    int sensorIndex = it->second;
    if (sensorIndex < 0 || labelValues == nullptr || labelValues[sensorIndex] == nullptr) {
        Serial.printf("[ERROR] Invalid sensor index %d for sensor '%s'\n", sensorIndex, sensorTag);
        return;
    }
    
    // Update the sensor value display with sci-fi formatting
    char valueBuffer[32];
    if (isnan(value)) {
        snprintf(valueBuffer, sizeof(valueBuffer), "--:--"); // Special display for NaN
    } else {
        // Format with fixed 2 decimal places for sci-fi look
        snprintf(valueBuffer, sizeof(valueBuffer), "%06.2f", value);
    }
    
    lv_label_set_text(labelValues[sensorIndex], valueBuffer);
    
    // Update blip position on radar/sensor display if it exists
    String blipTag = String("__blip_") + String(sensorTag);
    auto blipIt = astroBlipMap.find(blipTag);
    
    if (blipIt != astroBlipMap.end() && blipIt->second != nullptr) {
        lv_obj_t* blip = blipIt->second;
        
        // Calculate new position based on sensor value
        // Use value to determine distance from center (normalized between 0-100)
        float normalizedValue = isnan(value) ? 50.0f : min(max(value, 0.0f), 100.0f);
        
        // Get sensor display dimensions
        lv_obj_t* sensorDisplay = lv_obj_get_parent(blip);
        int displayWidth = lv_obj_get_width(sensorDisplay);
        int displayHeight = lv_obj_get_height(sensorDisplay);
        int centerX = displayWidth / 2;
        int centerY = displayHeight / 2;
        
        // Calculate position - each sensor moves in different pattern
        int newX, newY;
        
        // Different movement patterns based on sensor index
        switch (sensorIndex % 4) {
            case 0: // Circular pattern
                {
                    float angle = (millis() / 1000.0f) + (normalizedValue * 3.6f);
                    float radius = 20 + (normalizedValue * displayWidth / 200.0f);
                    newX = centerX + cos(angle) * radius;
                    newY = centerY + sin(angle) * radius;
                }
                break;
                
            case 1: // Horizontal oscillation
                {
                    float oscillation = sin(millis() / 1000.0f) * displayWidth / 4;
                    newX = centerX + oscillation;
                    newY = centerY + (normalizedValue - 50) * displayHeight / 100;
                }
                break;
                
            case 2: // Vertical oscillation
                {
                    float oscillation = sin(millis() / 1200.0f) * displayHeight / 4;
                    newX = centerX + (normalizedValue - 50) * displayWidth / 100;
                    newY = centerY + oscillation;
                }
                break;
                
            case 3: // Spiral pattern
                {
                    float angle = (millis() / 1500.0f);
                    float radius = 10 + (normalizedValue * displayWidth / 300.0f);
                    newX = centerX + cos(angle) * radius * (1 + sin(angle/2) * 0.3f);
                    newY = centerY + sin(angle) * radius * (1 + cos(angle/2) * 0.3f);
                }
                break;
                
            default:
                newX = centerX;
                newY = centerY;
        }
        
        // Constrain to display boundaries with padding
        int padding = 10;
        newX = max(padding, min(newX, displayWidth - padding));
        newY = max(padding, min(newY, displayHeight - padding));
        
        // Update blip position with animation for smooth movement
        lv_anim_t blipAnim;
        lv_anim_init(&blipAnim);
        lv_anim_set_var(&blipAnim, blip);
        lv_anim_set_time(&blipAnim, 500); // 500ms transition
        
        // X position animation
        lv_anim_set_values(&blipAnim, lv_obj_get_x(blip), newX);
        lv_anim_set_exec_cb(&blipAnim, [](void* var, int32_t v) {
            lv_obj_set_x((lv_obj_t*)var, v);
        });
        lv_anim_set_path_cb(&blipAnim, lv_anim_path_ease_out);
        lv_anim_start(&blipAnim);
        
        // Y position animation (separate animation)
        lv_anim_t blipAnimY;
        lv_anim_init(&blipAnimY);
        lv_anim_set_var(&blipAnimY, blip);
        lv_anim_set_time(&blipAnimY, 500); // 500ms transition
        lv_anim_set_values(&blipAnimY, lv_obj_get_y(blip), newY);
        lv_anim_set_exec_cb(&blipAnimY, [](void* var, int32_t v) {
            lv_obj_set_y((lv_obj_t*)var, v);
        });
        lv_anim_set_path_cb(&blipAnimY, lv_anim_path_ease_out);
        lv_anim_start(&blipAnimY);
        
        // Update blip appearance based on value
        if (!isnan(value)) {
            // Adjust size based on value
            int newSize = 6 + (normalizedValue / 20.0f);
            lv_obj_set_size(blip, newSize, newSize);
            
            // Adjust glow/shadow based on value
            lv_obj_set_style_shadow_width(blip, 5 + (normalizedValue / 10.0f), 0);
            
            // Pulse the blip when value changes significantly
            static float lastValues[4] = {0};
            if (abs(lastValues[sensorIndex % 4] - normalizedValue) > 10.0f) {
                // Create a pulse animation
                lv_anim_t pulseAnim;
                lv_anim_init(&pulseAnim);
                lv_anim_set_var(&pulseAnim, blip);
                lv_anim_set_time(&pulseAnim, 300);
                lv_anim_set_values(&pulseAnim, newSize, newSize * 1.5f);
                lv_anim_set_exec_cb(&pulseAnim, [](void* var, int32_t v) {
                    lv_obj_set_size((lv_obj_t*)var, v, v);
                    lv_obj_center((lv_obj_t*)var); // Keep centered as it grows
                });
                lv_anim_set_path_cb(&pulseAnim, lv_anim_path_overshoot);
                lv_anim_set_repeat_count(&pulseAnim, 1);
                lv_anim_set_playback_time(&pulseAnim, 300);
                lv_anim_set_playback_delay(&pulseAnim, 0);
                lv_anim_start(&pulseAnim);
                
                lastValues[sensorIndex % 4] = normalizedValue;
            }
        }
    }
}