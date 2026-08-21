import React, { useState, useEffect } from "react";
import axios from "axios";

function Banner() {
  const [trendingMovies, setTrendingMovies] = useState([]);
  const [currentIndex, setCurrentIndex] = useState(0);

  useEffect(() => {
    async function fetchTrending() {
      try {
        const response = await axios.get(
          `https://api.themoviedb.org/3/trending/movie/day?api_key=3aec63790d50f3b9fc2efb4c15a8cf99&language=en-US`
        );
        // Only keep movies with backdrop images
        const validMovies = response.data.results.filter(movie => movie.backdrop_path);
        setTrendingMovies(validMovies.slice(0, 10)); // Take top 10
      } catch (error) {
        console.error("Failed to fetch trending movies for banner:", error);
      }
    }
    fetchTrending();
  }, []);

  // Set up the automatic slideshow timer
  useEffect(() => {
    if (trendingMovies.length === 0) return;

    const timer = setInterval(() => {
      setCurrentIndex((prevIndex) => (prevIndex + 1) % trendingMovies.length);
    }, 6000); // Change slide every 6 seconds

    return () => clearInterval(timer);
  }, [trendingMovies.length]);

  if (trendingMovies.length === 0) {
    return <div className="h-[50vh] md:h-[70vh] w-full bg-neutral-900 animate-pulse"></div>;
  }

  const currentMovie = trendingMovies[currentIndex];
  const rtScore = Math.floor(currentMovie.vote_average * 10);

  return (
    <div className="relative h-[65vh] md:h-[80vh] w-full bg-neutral-950 overflow-hidden group">
      
      {/* Background Slideshow images wrapper */}
      {trendingMovies.map((movie, index) => (
        <div 
          key={movie.id}
          className={`absolute inset-0 transition-opacity duration-1000 ease-in-out ${
            index === currentIndex ? "opacity-100 z-0" : "opacity-0 -z-10"
          }`}
          style={{
            backgroundImage: `url(https://image.tmdb.org/t/p/original/${movie.backdrop_path})`,
            backgroundSize: "cover",
            backgroundPosition: "top center",
          }}
        ></div>
      ))}

      {/* Gentle bottom gradient for mobile readability edge cases, no full dark overlay! */}
      <div className="absolute inset-x-0 bottom-0 h-1/3 bg-gradient-to-t from-black/60 to-transparent z-10 md:hidden"></div>

      {/* Content Side - Paintbrush Stroke Glassmorphism */}
      <div className="absolute inset-0 z-20 flex flex-col justify-end md:justify-center p-4 md:p-12 lg:p-16 w-full md:w-[70%] lg:w-[55%]">
        
        {/* The Paintbrush Container behind text */}
        <div className="relative p-8 md:p-10 z-10 group-hover:scale-[1.01] transition-transform duration-500">
          
          {/* Base Paintbrush Stroke 1 */}
          <div 
            className="absolute inset-0 bg-black/30 backdrop-blur-lg -z-10 transition-all duration-500"
            style={{
              clipPath: "polygon(2% 8%, 97% 2%, 99% 92%, 4% 98%, 0% 50%)",
              borderRadius: "20px 60px 15px 50px / 60px 15px 50px 20px",
              transform: "scale(1.05) rotate(-1.5deg)"
            }}
          ></div>
          
          {/* Base Paintbrush Stroke 2 (Offset for rough brush texture) */}
          <div 
            className="absolute inset-0 bg-white/5 backdrop-blur-md -z-20 shadow-[0_8px_32px_rgba(0,0,0,0.5)]"
            style={{
              clipPath: "polygon(4% 0%, 99% 5%, 95% 98%, 0% 90%, 1% 45%)",
              borderRadius: "50px 20px 60px 15px / 15px 50px 20px 60px",
              transform: "scale(1.02) rotate(1.5deg)"
            }}
          ></div>

          {/* Animated Blob effect confined inside the brush stroke area */}
          <div 
            className="absolute inset-0 bg-gradient-to-r from-blue-500/20 via-purple-500/20 to-pink-500/20 blur-3xl opacity-60 animate-pulse mix-blend-overlay -z-10" 
            style={{ 
              borderRadius: "30% 70% 70% 30% / 30% 30% 70% 70%",
              transform: "scale(0.85)" 
            }}
          ></div>

          {/* Actual Text Content */}
          <div className="relative z-10">
            <h1 
              className="text-4xl md:text-5xl lg:text-6xl font-black text-white mb-4 leading-tight drop-shadow-lg transition-all duration-700"
            >
              {currentMovie.title || currentMovie.name}
            </h1>

            {/* Ratings Row */}
            <div className="flex flex-wrap items-center gap-4 text-sm md:text-base font-semibold text-gray-200 mb-6 drop-shadow-md">
              <div className="flex items-center gap-1.5">
                <i className="fa-solid fa-star text-yellow-400"></i>
                <span>{currentMovie.vote_average.toFixed(1)}</span>
              </div>
              <span className="text-gray-400">•</span>
              <div className="flex items-center gap-1.5">
                <img src="https://upload.wikimedia.org/wikipedia/commons/5/5b/Rotten_Tomatoes.svg" alt="RT" className="w-5 h-5 bg-white rounded-full p-0.5 shadow" />
                <span>{rtScore}%</span>
              </div>
              <span className="text-gray-400">•</span>
              <div className="flex items-center gap-1.5">
                <i className="fa-solid fa-fire text-orange-400"></i>
                <span>{Math.floor(currentMovie.popularity)} K</span>
              </div>
            </div>

            {/* Overview (Line clamped) */}
            <p className="text-gray-200 text-sm md:text-lg mb-8 line-clamp-3 leading-relaxed drop-shadow">
              {currentMovie.overview}
            </p>

            {/* Action Buttons */}
            <div className="flex items-center gap-4">
              <button className="flex items-center gap-2 px-6 md:px-8 py-3 bg-white text-black rounded-lg font-bold text-lg hover:bg-gray-200 hover:scale-105 transition-all duration-300 shadow-lg">
                <i className="fa-solid fa-play"></i> Watch Now
              </button>
              
              <button className="flex items-center gap-2 px-6 md:px-8 py-3 bg-white/10 backdrop-blur-md text-white rounded-lg font-bold text-lg hover:bg-white/20 hover:scale-105 border border-white/20 transition-all duration-300 shadow-lg">
                <i className="fa-solid fa-circle-info border-white"></i> Details
              </button>
            </div>
          </div>
        </div>
      </div>
      
      {/* Slideshow Manual Controls */}
      <div className="absolute right-8 bottom-8 z-30 hidden md:flex gap-2">
        {trendingMovies.map((_, idx) => (
          <button
            key={idx}
            onClick={() => setCurrentIndex(idx)}
            className={`h-2 rounded-full transition-all duration-500 shadow-md ${
              idx === currentIndex ? "w-8 bg-white" : "w-2 bg-white/50 hover:bg-white/80"
            }`}
            aria-label={`Go to slide ${idx + 1}`}
          ></button>
        ))}
      </div>
    </div>
  );
}

export default Banner;