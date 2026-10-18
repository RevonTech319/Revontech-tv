package com.revontech.tv

import android.content.Intent
import android.graphics.Color
import android.graphics.drawable.ColorDrawable
import android.net.Uri
import android.os.Bundle
import android.os.Handler
import android.os.Looper
import android.view.Gravity
import android.view.LayoutInflater
import android.view.View
import android.view.ViewGroup
import android.widget.ImageView
import android.widget.LinearLayout
import android.widget.ProgressBar
import android.widget.TextView
import android.widget.Toast
import androidx.cardview.widget.CardView
import androidx.fragment.app.Fragment
import androidx.recyclerview.widget.GridLayoutManager
import androidx.recyclerview.widget.RecyclerView
import androidx.swiperefreshlayout.widget.SwipeRefreshLayout
import androidx.viewpager2.widget.ViewPager2
import com.bumptech.glide.Glide
import com.bumptech.glide.load.resource.drawable.DrawableTransitionOptions
import com.google.android.material.floatingactionbutton.FloatingActionButton
import com.google.firebase.firestore.FirebaseFirestore
import java.util.Date

class HomeFragment : Fragment() {

    private lateinit var firestore: FirebaseFirestore
    private lateinit var rvChannels: RecyclerView
    private lateinit var swipeRefresh: SwipeRefreshLayout
    private lateinit var categoryContainer: LinearLayout
    private lateinit var emptyState: View

    // Promotional Slider widgets
    private lateinit var sliderContainer: View
    private lateinit var bannerViewPager: ViewPager2
    private lateinit var bannerIndicatorContainer: LinearLayout
    private lateinit var fabWhatsapp: FloatingActionButton

    private var allChannels = mutableListOf<Channel>()
    private var filteredChannels = mutableListOf<Channel>()
    private var categories = mutableListOf("All")
    private var selectedCategory = "All"

    private lateinit var adapter: ChannelAdapter
    private var shimmerAnimator: android.animation.ObjectAnimator? = null

    // Slider variables
    private val sliderList = mutableListOf<SliderImage>()
    private var currentSliderPage = 0
    private val sliderHandler = Handler(Looper.getMainLooper())
    private val sliderRunnable = object : Runnable {
        override fun run() {
            if (sliderList.isNotEmpty()) {
                currentSliderPage = (currentSliderPage + 1) % sliderList.size
                bannerViewPager.setCurrentItem(currentSliderPage, true)
                sliderHandler.postDelayed(this, 4000)
            }
        }
    }

    private var supportNumber = "255712345678" // Default fallback

    override fun onCreateView(
        inflater: LayoutInflater, container: ViewGroup?,
        savedInstanceState: Bundle?
    ): View? {
        val view = inflater.inflate(R.layout.fragment_home, container, false)

        firestore = FirebaseFirestore.getInstance()
        rvChannels = view.findViewById(R.id.rv_channels)
        swipeRefresh = view.findViewById(R.id.swipe_refresh)
        categoryContainer = view.findViewById(R.id.category_container)
        emptyState = view.findViewById(R.id.empty_state)

        // Find slider views and FAB
        sliderContainer = view.findViewById(R.id.slider_container)
        bannerViewPager = view.findViewById(R.id.banner_view_pager)
        bannerIndicatorContainer = view.findViewById(R.id.banner_indicator_container)
        fabWhatsapp = view.findViewById(R.id.fab_whatsapp)

        setupRecyclerView()
        setupSwipeRefresh()
        setupWhatsappSupport()

        // Fetch home sliders and channels from Firebase Firestore
        fetchSliders()
        fetchChannels()

        return view
    }

    private fun setupRecyclerView() {
        val screenWidthDp = resources.configuration.screenWidthDp
        val columns = when {
            screenWidthDp >= 960 -> 5
            screenWidthDp >= 720 -> 4
            screenWidthDp >= 600 -> 3
            else -> 2
        }

        rvChannels.layoutManager = GridLayoutManager(context, columns)

        try {
            val skeletonGrid = emptyState.findViewById<android.widget.GridLayout>(R.id.skeleton_grid)
            if (skeletonGrid != null) {
                skeletonGrid.columnCount = columns
            }
        } catch (e: Exception) {
            android.util.Log.e("HomeFragment", "Failed to setup skeleton grid columns: ${e.message}")
        }

        adapter = ChannelAdapter(filteredChannels) { channel ->
            // Click listener: play selected channel in Native Player
            val intent = Intent(context, PlayerActivity::class.java).apply {
                putExtra("channel", channel)
            }
            startActivity(intent)
        }
        rvChannels.adapter = adapter
    }


    private fun setupSwipeRefresh() {
        swipeRefresh.setColorSchemeResources(R.color.primary, R.color.accent_gold)
        swipeRefresh.setOnRefreshListener {
            fetchSliders()
            fetchChannels()
        }
    }

    private fun setupWhatsappSupport() {
        // Read WhatsApp support details from Settings
        firestore.collection("settings").document("general_settings")
            .get()
            .addOnSuccessListener { doc ->
                if (!isAdded || context == null) return@addOnSuccessListener
                if (doc.exists()) {
                    val num = doc.getString("support_number")
                    if (!num.isNullOrEmpty()) {
                        supportNumber = num.replace("+", "").replace(" ", "").trim()
                    }
                }
            }
            .addOnFailureListener {
                // Ignore, use default fallback number
            }

        fabWhatsapp.setOnClickListener {
            try {
                val waUrl = "https://wa.me/$supportNumber"
                val intent = Intent(Intent.ACTION_VIEW, Uri.parse(waUrl)).apply {
                    setPackage("com.whatsapp")
                }
                startActivity(intent)
            } catch (e: Exception) {
                // WhatsApp is not installed, open in browser fallback
                try {
                    val waUrl = "https://wa.me/$supportNumber"
                    val intent = Intent(Intent.ACTION_VIEW, Uri.parse(waUrl))
                    startActivity(intent)
                } catch (err: Exception) {
                    Toast.makeText(context, "Imeshindikana kufungua WhatsApp!", Toast.LENGTH_SHORT).show()
                }
            }
        }
    }

    private fun fetchSliders() {
        firestore.collection("slider_images")
            .get()
            .addOnSuccessListener { documents ->
                if (!isAdded || context == null) return@addOnSuccessListener
                sliderList.clear()
                for (doc in documents) {
                    val active = doc.getBoolean("active") ?: true
                    if (active) {
                        val slide = doc.toObject(SliderImage::class.java)
                        slide.id = doc.id
                        sliderList.add(slide)
                    }
                }

                // Sort by sort_order
                sliderList.sortBy { it.sort_order }

                if (sliderList.isNotEmpty()) {
                    sliderContainer.visibility = View.VISIBLE
                    setupSliderViewPager()
                } else {
                    sliderContainer.visibility = View.GONE
                }
            }
            .addOnFailureListener { e ->
                if (!isAdded || context == null) return@addOnFailureListener
                android.util.Log.e("HomeFragment", "Slider images fetch failed: ${e.message}")
                sliderContainer.visibility = View.GONE
            }
    }

    private fun setupSliderViewPager() {
        val bannerAdapter = BannerAdapter(sliderList)
        bannerViewPager.adapter = bannerAdapter
        
        // Dynamic Indicator Dots Creation
        setupIndicatorDots(sliderList.size)
        bannerViewPager.registerOnPageChangeCallback(object : ViewPager2.OnPageChangeCallback() {
            override fun onPageSelected(position: Int) {
                currentSliderPage = position
                updateIndicatorDots(position)
            }
        })

        // Start Auto-scrolling
        startSliderTimer()
    }

    private fun setupIndicatorDots(count: Int) {
        if (!isAdded || context == null) return
        bannerIndicatorContainer.removeAllViews()
        val dots = arrayOfNulls<ImageView>(count)
        val params = LinearLayout.LayoutParams(
            ViewGroup.LayoutParams.WRAP_CONTENT,
            ViewGroup.LayoutParams.WRAP_CONTENT
        ).apply {
            setMargins(8, 0, 8, 0)
        }

        for (i in 0 until count) {
            dots[i] = ImageView(requireContext())
            dots[i]?.setImageResource(R.drawable.dot_inactive)
            bannerIndicatorContainer.addView(dots[i], params)
        }

        if (count > 0) {
            dots[0]?.setImageResource(R.drawable.dot_active)
        }
    }

    private fun updateIndicatorDots(position: Int) {
        val count = bannerIndicatorContainer.childCount
        for (i in 0 until count) {
            val img = bannerIndicatorContainer.getChildAt(i) as? ImageView
            if (i == position) {
                img?.setImageResource(R.drawable.dot_active)
            } else {
                img?.setImageResource(R.drawable.dot_inactive)
            }
        }
    }

    private fun startSliderTimer() {
        sliderHandler.removeCallbacks(sliderRunnable)
        sliderHandler.postDelayed(sliderRunnable, 4000)
    }

    private fun stopSliderTimer() {
        sliderHandler.removeCallbacks(sliderRunnable)
    }

    private fun fetchChannels() {
        emptyState.visibility = View.VISIBLE
        startShimmerAnimation()
        firestore.collection("channels")
            .get()
            .addOnSuccessListener { documents ->
                if (!isAdded || context == null) return@addOnSuccessListener
                swipeRefresh.isRefreshing = false
                emptyState.visibility = View.GONE
                stopShimmerAnimation()
                
                allChannels.clear()
                for (doc in documents) {
                    val active = doc.getBoolean("active") ?: true
                    if (active) {
                        val channel = doc.toObject(Channel::class.java)
                        channel.id = doc.id
                        
                        // Robust website-parity check for is_free / isFree (bool or string)
                        val rawIsFree = doc.get("is_free") ?: doc.get("isFree")
                        val parsedIsFree = when (rawIsFree) {
                            is Boolean -> rawIsFree
                            is String -> rawIsFree.trim().lowercase() == "true"
                            else -> false
                        }
                        channel.is_free = parsedIsFree

                        allChannels.add(channel)
                    }
                }

                // Sort channels manually by sort_order
                allChannels.sortBy { it.sort_order }

                // Populate categories dynamically from Firestore data
                val uniqueCats = allChannels.map { it.category }.distinct().filter { it.isNotEmpty() }
                categories.clear()
                categories.add("All")
                categories.addAll(uniqueCats)

                setupCategoryChips()
                filterChannels()
            }
            .addOnFailureListener { exception ->
                if (!isAdded || context == null) return@addOnFailureListener
                swipeRefresh.isRefreshing = false
                emptyState.visibility = View.GONE
                stopShimmerAnimation()
                Toast.makeText(context, "Imeshindikana kupakia vituo: ${exception.message}", Toast.LENGTH_LONG).show()
            }
    }

    private fun setupCategoryChips() {
        if (!isAdded || context == null) return
        categoryContainer.removeAllViews()
        
        for (cat in categories) {
            val textView = TextView(requireContext()).apply {
                text = cat
                textSize = 12f
                setPadding(36, 18, 36, 18)
                gravity = Gravity.CENTER
                layoutParams = LinearLayout.LayoutParams(
                    LinearLayout.LayoutParams.WRAP_CONTENT,
                    LinearLayout.LayoutParams.WRAP_CONTENT
                ).apply {
                    setMargins(0, 0, 16, 0)
                }
                
                // Royal Blue highlight for active category selection
                if (selectedCategory == cat) {
                    setBackgroundResource(R.drawable.chip_selected)
                    setTextColor(Color.WHITE)
                } else {
                    setBackgroundResource(R.drawable.chip_unselected)
                    setTextColor(Color.parseColor("#9CA3AF"))
                }

                setOnClickListener {
                    selectedCategory = cat
                    setupCategoryChips()
                    filterChannels()
                }
            }
            categoryContainer.addView(textView)
        }
    }

    private fun filterChannels() {
        filteredChannels.clear()
        if (selectedCategory == "All") {
            filteredChannels.addAll(allChannels)
        } else {
            filteredChannels.addAll(allChannels.filter { it.category == selectedCategory })
        }
        
        adapter.notifyDataSetChanged()
        
        if (filteredChannels.isEmpty()) {
            Toast.makeText(context, "Hakuna vituo vya kitengo hiki", Toast.LENGTH_SHORT).show()
        }
    }

    override fun onResume() {
        super.onResume()
        startSliderTimer()
    }

    override fun onPause() {
        super.onPause()
        stopSliderTimer()
    }

    private fun startShimmerAnimation() {
        if (!isAdded || context == null) return
        shimmerAnimator?.cancel()
        shimmerAnimator = android.animation.ObjectAnimator.ofFloat(emptyState, "alpha", 0.4f, 1.0f).apply {
            duration = 1000
            repeatCount = android.animation.ValueAnimator.INFINITE
            repeatMode = android.animation.ValueAnimator.REVERSE
            start()
        }
    }

    private fun stopShimmerAnimation() {
        shimmerAnimator?.cancel()
        shimmerAnimator = null
        emptyState.alpha = 1.0f
    }

    override fun onDestroyView() {
        stopShimmerAnimation()
        super.onDestroyView()
        stopSliderTimer()
    }



    // ViewPager2 Slider Banner Adapter
    private class BannerAdapter(
        private val list: List<SliderImage>
    ) : RecyclerView.Adapter<BannerAdapter.ViewHolder>() {

        class ViewHolder(view: View) : RecyclerView.ViewHolder(view) {
            val imgBanner: ImageView = view.findViewById(R.id.img_banner)
            val tvCaption: TextView = view.findViewById(R.id.tv_banner_caption)
        }

        override fun onCreateViewHolder(parent: ViewGroup, viewType: Int): ViewHolder {
            val view = LayoutInflater.from(parent.context)
                .inflate(R.layout.item_banner, parent, false)
            return ViewHolder(view)
        }

        override fun onBindViewHolder(holder: ViewHolder, position: Int) {
            val slide = list[position]
            holder.tvCaption.text = slide.caption ?: ""

            if (slide.img_url.isNotEmpty()) {
                Glide.with(holder.itemView.context)
                    .load(slide.img_url)
                    .transition(DrawableTransitionOptions.withCrossFade())
                    .placeholder(android.R.drawable.ic_menu_gallery)
                    .into(holder.imgBanner)
            } else {
                holder.imgBanner.setImageResource(android.R.drawable.ic_menu_slideshow)
            }
        }

        override fun getItemCount() = list.size
    }

    // Inner Channel Adapter
    private class ChannelAdapter(
        private val channels: List<Channel>,
        private val onClick: (Channel) -> Unit
    ) : RecyclerView.Adapter<ChannelAdapter.ViewHolder>() {

        class ViewHolder(view: View) : RecyclerView.ViewHolder(view) {
            val imgLogo: ImageView = view.findViewById(R.id.img_logo)
            val tvName: TextView = view.findViewById(R.id.tv_channel_name)
            val badgeContainer: LinearLayout = view.findViewById(R.id.badge_container)
            val tvBadgeText: TextView = view.findViewById(R.id.tv_badge_text)
            val badgeDot: View = view.findViewById(R.id.badge_dot)
            val card: CardView = view as CardView
        }

        override fun onCreateViewHolder(parent: ViewGroup, viewType: Int): ViewHolder {
            val view = LayoutInflater.from(parent.context)
                .inflate(R.layout.item_channel, parent, false)
            return ViewHolder(view)
        }

        override fun onBindViewHolder(holder: ViewHolder, position: Int) {
            val ch = channels[position]
            holder.tvName.text = ch.name

            // Programmatically style dynamic badges based on 'is_free'
            if (ch.is_free) {
                holder.tvBadgeText.text = "FREE"
                holder.badgeContainer.background = ColorDrawable(Color.parseColor("#10B981")) // Green badge
                holder.badgeDot.visibility = View.GONE
            } else {
                holder.tvBadgeText.text = "LIVE"
                holder.badgeContainer.background = ColorDrawable(Color.parseColor("#E11D48")) // Crimson LIVE badge
                holder.badgeDot.visibility = View.VISIBLE
            }

            // Load remote image dynamically using Glide with fading effects
            if (!ch.img_url.isNullOrEmpty()) {
                Glide.with(holder.itemView.context)
                    .load(ch.img_url)
                    .transition(DrawableTransitionOptions.withCrossFade())
                    .placeholder(R.mipmap.ic_launcher)
                    .error(R.mipmap.ic_launcher)
                    .into(holder.imgLogo)
            } else {
                holder.imgLogo.setImageResource(R.mipmap.ic_launcher)
            }

            holder.card.setOnClickListener {
                onClick(ch)
            }
        }

        override fun getItemCount(): Int = channels.size
    }
}
