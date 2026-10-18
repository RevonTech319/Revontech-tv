package com.revontech.tv

import android.graphics.Color
import android.os.Bundle
import android.text.Editable
import android.text.TextWatcher
import android.view.Gravity
import android.view.LayoutInflater
import android.view.View
import android.view.ViewGroup
import android.widget.EditText
import android.widget.ImageView
import android.widget.LinearLayout
import android.widget.TextView
import android.widget.Toast
import androidx.cardview.widget.CardView
import androidx.fragment.app.Fragment
import androidx.recyclerview.widget.GridLayoutManager
import androidx.recyclerview.widget.RecyclerView
import androidx.swiperefreshlayout.widget.SwipeRefreshLayout
import com.bumptech.glide.Glide
import com.bumptech.glide.load.resource.drawable.DrawableTransitionOptions
import com.google.firebase.auth.FirebaseAuth
import com.google.firebase.firestore.FirebaseFirestore

class MoviesFragment : Fragment() {

    private lateinit var firestore: FirebaseFirestore
    private lateinit var auth: FirebaseAuth
    private lateinit var rvMovies: RecyclerView
    private lateinit var swipeRefresh: SwipeRefreshLayout
    private lateinit var categoryContainer: LinearLayout
    private lateinit var emptyState: View
    private lateinit var etSearch: EditText

    private var allMovies = mutableListOf<Movie>()
    private var filteredMovies = mutableListOf<Movie>()
    private var categories = mutableListOf("All")
    private var selectedCategory = "All"
    private var searchQuery = ""

    private lateinit var adapter: MovieAdapter
    private var shimmerAnimator: android.animation.ObjectAnimator? = null

    override fun onCreateView(
        inflater: LayoutInflater, container: ViewGroup?,
        savedInstanceState: Bundle?
    ): View? {
        val view = inflater.inflate(R.layout.fragment_movies, container, false)

        firestore = FirebaseFirestore.getInstance()
        auth = FirebaseAuth.getInstance()
        rvMovies = view.findViewById(R.id.rv_movies)
        swipeRefresh = view.findViewById(R.id.swipe_refresh)
        categoryContainer = view.findViewById(R.id.category_container)
        emptyState = view.findViewById(R.id.empty_state)
        etSearch = view.findViewById(R.id.et_search)

        setupRecyclerView()
        setupSwipeRefresh()
        setupSearch()
        fetchMovies()

        return view
    }

    private fun setupRecyclerView() {
        val screenWidthDp = resources.configuration.screenWidthDp
        val columns = when {
            screenWidthDp >= 960 -> 4
            screenWidthDp >= 720 -> 3
            screenWidthDp >= 600 -> 2
            else -> 2
        }

        rvMovies.layoutManager = GridLayoutManager(context, columns)

        adapter = MovieAdapter(filteredMovies) { movie ->
            // Click listener: show movie details
            showMovieDetail(movie)
        }
        rvMovies.adapter = adapter
    }

    private fun setupSwipeRefresh() {
        swipeRefresh.setColorSchemeResources(R.color.primary, R.color.accent_gold)
        swipeRefresh.setOnRefreshListener {
            fetchMovies()
        }
    }

    private fun setupSearch() {
        etSearch.addTextChangedListener(object : TextWatcher {
            override fun beforeTextChanged(s: CharSequence?, start: Int, count: Int, after: Int) {}
            override fun onTextChanged(s: CharSequence?, start: Int, before: Int, count: Int) {}
            override fun afterTextChanged(s: Editable?) {
                searchQuery = s?.toString() ?: ""
                filterMovies()
            }
        })
    }

    private fun fetchMovies() {
        emptyState.visibility = View.VISIBLE
        startShimmerAnimation()
        
        firestore.collection("movies")
            .whereEqualTo("active", true)
            .get()
            .addOnSuccessListener { documents ->
                if (!isAdded || context == null) return@addOnSuccessListener
                swipeRefresh.isRefreshing = false
                
                allMovies.clear()
                for (doc in documents) {
                    val movie = doc.toObject(Movie::class.java)
                    movie.id = doc.id

                    // Parse episodes if available
                    val episodesList = doc.get("episodes") as? List<Map<String, Any>>
                    if (episodesList != null) {
                        movie.episodes = episodesList.map { epMap ->
                            Episode(
                                title = epMap["title"] as? String ?: "",
                                driveId = epMap["driveId"] as? String ?: ""
                            )
                        }
                    }

                    allMovies.add(movie)
                }

                if (allMovies.isEmpty()) {
                    emptyState.visibility = View.VISIBLE
                    stopShimmerAnimation()
                } else {
                    emptyState.visibility = View.GONE
                    stopShimmerAnimation()
                }

                // Sort by sort_order then title
                allMovies.sortWith(compareBy({ it.sort_order }, { it.title }))

                // Populate categories
                val uniqueCats = allMovies.map { it.category }.distinct().filter { it.isNotEmpty() }
                categories.clear()
                categories.add("All")
                categories.addAll(uniqueCats)

                setupCategoryChips()
                filterMovies()
                
                // Log count for debugging
                android.util.Log.d("MoviesFragment", "Fetched ${allMovies.size} movies")
            }
            .addOnFailureListener { exception ->
                if (!isAdded || context == null) return@addOnFailureListener
                swipeRefresh.isRefreshing = false
                emptyState.visibility = View.GONE
                stopShimmerAnimation()
                Toast.makeText(context, "Imeshindikana kupakia filamu: ${exception.message}", Toast.LENGTH_LONG).show()
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
                    filterMovies()
                }
            }
            categoryContainer.addView(textView)
        }
    }

    private fun filterMovies() {
        filteredMovies.clear()
        
        for (movie in allMovies) {
            val matchesCategory = selectedCategory == "All" || movie.category == selectedCategory
            val matchesSearch = searchQuery.isEmpty() || 
                                movie.title.contains(searchQuery, ignoreCase = true) ||
                                movie.description.contains(searchQuery, ignoreCase = true)
            
            if (matchesCategory && matchesSearch) {
                filteredMovies.add(movie)
            }
        }
        
        adapter.notifyDataSetChanged()
    }

    private fun showMovieDetail(movie: Movie) {
        val fragment = MovieDetailFragment().apply {
            arguments = Bundle().apply {
                putSerializable("movie", movie)
            }
        }
        parentFragmentManager.beginTransaction()
            .replace(R.id.fragment_container, fragment)
            .addToBackStack(null)
            .commit()
    }

    private fun startShimmerAnimation() {
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
    }

    // Inner Movie Adapter
    private class MovieAdapter(
        private val movies: List<Movie>,
        private val onClick: (Movie) -> Unit
    ) : RecyclerView.Adapter<MovieAdapter.ViewHolder>() {

        class ViewHolder(view: View) : RecyclerView.ViewHolder(view) {
            val imgPoster: ImageView = view.findViewById(R.id.img_poster)
            val tvTitle: TextView = view.findViewById(R.id.tv_movie_title)
            val tvYear: TextView = view.findViewById(R.id.tv_movie_year)
            val tvCategory: TextView = view.findViewById(R.id.tv_movie_category)
            val badgeFree: View = view.findViewById(R.id.badge_free)
            val card: CardView = view as CardView
        }

        override fun onCreateViewHolder(parent: ViewGroup, viewType: Int): ViewHolder {
            val view = LayoutInflater.from(parent.context)
                .inflate(R.layout.item_movie, parent, false)
            return ViewHolder(view)
        }

        override fun onBindViewHolder(holder: ViewHolder, position: Int) {
            val movie = movies[position]
            holder.tvTitle.text = movie.title
            holder.tvYear.text = movie.year
            holder.tvCategory.text = movie.category

            // Show FREE badge if applicable
            holder.badgeFree.visibility = if (movie.is_free) View.VISIBLE else View.GONE

            // Load poster image
            if (movie.poster.isNotEmpty()) {
                Glide.with(holder.itemView.context)
                    .load(movie.poster)
                    .transition(DrawableTransitionOptions.withCrossFade())
                    .placeholder(R.mipmap.ic_launcher)
                    .error(R.mipmap.ic_launcher)
                    .into(holder.imgPoster)
            } else {
                holder.imgPoster.setImageResource(R.mipmap.ic_launcher)
            }

            holder.card.setOnClickListener {
                onClick(movie)
            }
        }

        override fun getItemCount(): Int = movies.size
    }
}
