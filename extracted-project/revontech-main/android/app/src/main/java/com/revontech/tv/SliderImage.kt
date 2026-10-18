package com.revontech.tv

import com.google.firebase.firestore.PropertyName
import java.io.Serializable

data class SliderImage(
    var id: String = "",
    @get:PropertyName("img_url") @set:PropertyName("img_url") var img_url: String = "",
    @get:PropertyName("caption") @set:PropertyName("caption") var caption: String? = null,
    @get:PropertyName("active") @set:PropertyName("active") var active: Boolean = true,
    @get:PropertyName("sort_order") @set:PropertyName("sort_order") var sort_order: Int = 0
) : Serializable
