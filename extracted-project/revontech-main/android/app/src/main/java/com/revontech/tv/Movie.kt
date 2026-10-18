package com.revontech.tv

import java.io.Serializable

data class Movie(
    var id: String = "",
    var title: String = "",
    var slug: String = "",
    var poster: String = "",
    var description: String = "",
    var drive_id: String = "",
    var category: String = "General",
    var year: String = "",
    var is_free: Boolean = false,
    var active: Boolean = true,
    var sort_order: Int = 0,
    var imported_from: String? = null,
    var episodes: List<Episode>? = null,
    var created_at: Any? = null,
    var updated_at: Any? = null
) : Serializable

data class Episode(
    var title: String = "",
    var driveId: String = ""
) : Serializable
