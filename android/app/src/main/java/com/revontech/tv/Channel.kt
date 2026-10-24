package com.revontech.tv

import java.io.Serializable

data class Channel(
    var id: String = "",
    var name: String = "",
    var img_url: String? = null,
    var is_free: Boolean = false, // Default to false (needs package) for safety
    var category: String = "General",
    var sort_order: Int = 0,
    var active: Boolean = true,
    var url: String = "",
    var link_type: String = "hls",
    var drm_clear_key: String = "",
    var kid: String = "",
    var key: String = "",
    var drmKid: String = "",
    var drmKey: String = "",
    var drmClearKey: String = "",
    var type: String = "",
    // Manual backup source (managed in admin → Backup Links)
    var backup_url: String = "",
    var backup_type: String = "",
    var backup_kid: String = "",
    var backup_key: String = "",
    var backup_enabled: Boolean = false
) : Serializable
