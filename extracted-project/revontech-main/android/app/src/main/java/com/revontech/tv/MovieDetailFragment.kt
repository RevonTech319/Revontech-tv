package com.revontech.tv

import android.content.Intent
import android.net.Uri
import android.os.Bundle
import android.view.LayoutInflater
import android.view.View
import android.view.ViewGroup
import android.widget.Button
import android.widget.ImageView
import android.widget.LinearLayout
import android.widget.TextView
import android.widget.Toast
import androidx.fragment.app.Fragment
import androidx.recyclerview.widget.LinearLayoutManager
import androidx.recyclerview.widget.RecyclerView
import com.bumptech.glide.Glide
import com.bumptech.glide.load.resource.drawable.DrawableTransitionOptions
import com.google.firebase.auth.FirebaseAuth
import com.google.firebase.firestore.FirebaseFirestore

class MovieDetailFragment : Fragment() {

    private lateinit var auth: FirebaseAuth
    private lateinit var firestore: FirebaseFirestore
    private lateinit var movie: Movie

    private lateinit var imgPoster: ImageView
    private lateinit var tvTitle: TextView
    private lateinit var tvYear: TextView
    private lateinit var tvCategory: TextView
    private lateinit var tvDescription: TextView
    private lateinit var btnPlay: Button
    private lateinit var episodesContainer: LinearLayout
    private lateinit var rvEpisodes: RecyclerView
    private lateinit var tvEpisodesTitle: TextView

    override fun onCreateView(
        inflater: LayoutInflater, container: ViewGroup?,
        savedInstanceState: Bundle?
    ): View? {
        val view = inflater.inflate(R.layout.fragment_movie_detail, container, false)

        auth = FirebaseAuth.getInstance()
        firestore = FirebaseFirestore.getInstance()

        // Get movie from arguments
        movie = arguments?.getSerializable("movie") as? Movie ?: run {
            Toast.makeText(context, "Movie not found", Toast.LENGTH_SHORT).show()
            parentFragmentManager.popBackStack()
            return view
        }

        imgPoster = view.findViewById(R.id.img_poster)
        tvTitle = view.findViewById(R.id.tv_title)
        tvYear = view.findViewById(R.id.tv_year)
        tvCategory = view.findViewById(R.id.tv_category)
        tvDescription = view.findViewById(R.id.tv_description)
        btnPlay = view.findViewById(R.id.btn_play)
        episodesContainer = view.findViewById(R.id.episodes_container)
        rvEpisodes = view.findViewById(R.id.rv_episodes)
        tvEpisodesTitle = view.findViewById(R.id.tv_episodes_title)

        setupUI()
        return view
    }

    private fun setupUI() {
        // Load poster
        if (movie.poster.isNotEmpty()) {
            Glide.with(this)
                .load(movie.poster)
                .transition(DrawableTransitionOptions.withCrossFade())
                .placeholder(R.mipmap.ic_launcher)
                .error(R.mipmap.ic_launcher)
                .into(imgPoster)
        }

        // Set text fields
        tvTitle.text = movie.title
        tvYear.text = movie.year
        tvCategory.text = movie.category
        tvDescription.text = movie.description.ifEmpty { "No description available." }

        // Check if user has access
        checkAccessAndSetupPlayButton()

        // Setup episodes if available
        if (!movie.episodes.isNullOrEmpty()) {
            episodesContainer.visibility = View.VISIBLE
            tvEpisodesTitle.text = "Episodes (${movie.episodes!!.size})"
            setupEpisodesRecyclerView()
        } else {
            episodesContainer.visibility = View.GONE
        }
    }

    private fun checkAccessAndSetupPlayButton() {
        val currentUser = auth.currentUser
        if (currentUser == null) {
            btnPlay.text = "Login to Watch"
            btnPlay.setOnClickListener {
                Toast.makeText(context, "Please login first", Toast.LENGTH_SHORT).show()
            }
            return
        }

        // If movie is free, allow access
        if (movie.is_free) {
            btnPlay.text = "▶ Play in Browser"
            btnPlay.setOnClickListener {
                playMovieInBrowser(movie.drive_id)
            }
            return
        }

        // Check if user has active subscription
        firestore.collection("profiles")
            .document(currentUser.uid)
            .get()
            .addOnSuccessListener { doc ->
                if (!isAdded || context == null) return@addOnSuccessListener
                
                val isActive = doc.getBoolean("is_active") ?: false
                
                if (isActive) {
                    btnPlay.text = "▶ Play in Browser"
                    btnPlay.setOnClickListener {
                        playMovieInBrowser(movie.drive_id)
                    }
                } else {
                    btnPlay.text = "🔒 Subscribe to Watch"
                    btnPlay.setOnClickListener {
                        Toast.makeText(context, "You need an active subscription to watch this movie", Toast.LENGTH_LONG).show()
                        // Navigate to payment fragment
                        (activity as? MainActivity)?.loadPaymentFragment()
                    }
                }
            }
            .addOnFailureListener {
                btnPlay.text = "Error Loading Access"
                btnPlay.isEnabled = false
            }
    }

    private fun playMovieInBrowser(driveId: String) {
        if (driveId.isEmpty()) {
            Toast.makeText(context, "Video not available", Toast.LENGTH_SHORT).show()
            return
        }

        // Build Google Drive video URL
        val videoUrl = "https://drive.google.com/file/d/$driveId/preview"
        
        try {
            val intent = Intent(Intent.ACTION_VIEW, Uri.parse(videoUrl))
            // Try to open in Chrome first
            intent.setPackage("com.android.chrome")
            startActivity(intent)
        } catch (e: Exception) {
            // If Chrome not available, open in default browser
            try {
                val intent = Intent(Intent.ACTION_VIEW, Uri.parse(videoUrl))
                startActivity(intent)
            } catch (ex: Exception) {
                Toast.makeText(context, "No browser found to open video", Toast.LENGTH_SHORT).show()
            }
        }
    }

    private fun setupEpisodesRecyclerView() {
        rvEpisodes.layoutManager = LinearLayoutManager(context)
        val adapter = EpisodeAdapter(movie.episodes!!) { episode ->
            playEpisodeInBrowser(episode)
        }
        rvEpisodes.adapter = adapter
    }

    private fun playEpisodeInBrowser(episode: Episode) {
        if (episode.driveId.isEmpty()) {
            Toast.makeText(context, "Episode not available", Toast.LENGTH_SHORT).show()
            return
        }

        // Check access before playing
        val currentUser = auth.currentUser
        if (currentUser == null) {
            Toast.makeText(context, "Please login first", Toast.LENGTH_SHORT).show()
            return
        }

        if (!movie.is_free) {
            firestore.collection("profiles")
                .document(currentUser.uid)
                .get()
                .addOnSuccessListener { doc ->
                    if (!isAdded || context == null) return@addOnSuccessListener
                    
                    val isActive = doc.getBoolean("is_active") ?: false
                    
                    if (isActive) {
                        openEpisodeInBrowser(episode.driveId)
                    } else {
                        Toast.makeText(context, "You need an active subscription to watch this episode", Toast.LENGTH_LONG).show()
                        (activity as? MainActivity)?.loadPaymentFragment()
                    }
                }
        } else {
            openEpisodeInBrowser(episode.driveId)
        }
    }

    private fun openEpisodeInBrowser(driveId: String) {
        val videoUrl = "https://drive.google.com/file/d/$driveId/preview"
        
        try {
            val intent = Intent(Intent.ACTION_VIEW, Uri.parse(videoUrl))
            intent.setPackage("com.android.chrome")
            startActivity(intent)
        } catch (e: Exception) {
            try {
                val intent = Intent(Intent.ACTION_VIEW, Uri.parse(videoUrl))
                startActivity(intent)
            } catch (ex: Exception) {
                Toast.makeText(context, "No browser found to open video", Toast.LENGTH_SHORT).show()
            }
        }
    }

    // Inner Episode Adapter
    private class EpisodeAdapter(
        private val episodes: List<Episode>,
        private val onClick: (Episode) -> Unit
    ) : RecyclerView.Adapter<EpisodeAdapter.ViewHolder>() {

        class ViewHolder(view: View) : RecyclerView.ViewHolder(view) {
            val tvEpisodeTitle: TextView = view.findViewById(R.id.tv_episode_title)
            val btnPlayEpisode: Button = view.findViewById(R.id.btn_play_episode)
        }

        override fun onCreateViewHolder(parent: ViewGroup, viewType: Int): ViewHolder {
            val view = LayoutInflater.from(parent.context)
                .inflate(R.layout.item_episode, parent, false)
            return ViewHolder(view)
        }

        override fun onBindViewHolder(holder: ViewHolder, position: Int) {
            val episode = episodes[position]
            holder.tvEpisodeTitle.text = episode.title.ifEmpty { "Episode ${position + 1}" }
            
            holder.btnPlayEpisode.setOnClickListener {
                onClick(episode)
            }
        }

        override fun getItemCount(): Int = episodes.size
    }
}
