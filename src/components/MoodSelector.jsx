import React, { useState, useEffect } from "react";
import axios from "axios";
import MovieCard from "./MovieCard";

const moods = [
  { id: 28, name: "Action", color: "from-red-600 to-transparent", bgImage: "https://wallpaperaccess.com/full/141833.jpg" },
  { id: 35, name: "Comedy", color: "from-yellow-500 to-transparent", bgImage: "https://wallpaperaccess.com/full/1277600.jpg" },
  { id: 27, name: "Horror", color: "from-neutral-900 to-transparent", bgImage: "https://wallpapercave.com/wp/wp6946496.jpg" },
  { id: 10749, name: "Romance", color: "from-pink-600 to-transparent", bgImage: "https://wallpapercave.com/wp/wp3240755.jpg" },
  { id: 878, name: "Sci-Fi", color: "from-blue-600 to-transparent", bgImage: "https://wallpaperaccess.com/full/2221967.jpg" },
  { id: 16, name: "Animation", color: "from-purple-600 to-transparent", bgImage: "https://wallpaperaccess.com/full/10868864.jpg" }
];

function MoodSelector({ watchlist, handleAddtoWatchlist, handleRemoveFromWatchlist }) {
  const [selectedMood, setSelectedMood] = useState(null);
  const [movies, setMovies] = useState([]);

  useEffect(() => {
    if (!selectedMood) return;

    async function fetchMoviesByGenre() {
      try {
        const response = await axios.get(
          `https://api.themoviedb.org/3/discover/movie?api_key=3aec63790d50f3b9fc2efb4c15a8cf99&language=en-US&with_genres=${selectedMood}`
        );
        setMovies(response.data.results);
      } catch (error) {
        console.error("Error fetching mood movies:", error);
      }
    }

    fetchMoviesByGenre();
  }, [selectedMood]);

  return (
    <div className="p-4 md:p-8 max-w-7xl mx-auto">
      <h2 className="text-3xl font-bold mb-8 border-l-4 border-yellow-500 pl-4">What's your mood?</h2>

      {/* Mood Gallery */}
      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-4 mb-12">
        {moods.map((mood) => {
          const isSelected = selectedMood === mood.id;
          return (
            <div
              key={mood.id}
              onClick={() => setSelectedMood(mood.id)}
              className={`group relative h-40 rounded-xl overflow-hidden cursor-pointer transition-all duration-300 transform ${isSelected ? "scale-105 ring-4 ring-yellow-500 shadow-2xl z-10" : "hover:scale-105 hover:shadow-lg opacity-90 hover:opacity-100"
                }`}
              style={{
                backgroundImage: `url(${mood.bgImage})`,
                backgroundSize: 'cover',
                backgroundPosition: 'center'
              }}
            >
              {/* Base Translucent Dark Overlay similar to Home Page Banner */}
              <div className="absolute inset-0 bg-gradient-to-t from-neutral-950 via-neutral-950/60 to-transparent z-10"></div>
              
              {/* Color Tint Overlay */}
              <div className={`absolute inset-0 bg-gradient-to-t ${mood.color} opacity-50 z-10`}></div>

              {/* Text */}
              <div className="absolute inset-0 flex items-center justify-center p-4 z-20">
                <span 
                  className="text-white font-black text-2xl tracking-wider drop-shadow-lg transition-transform duration-300 group-hover:scale-110"
                  style={{ textShadow: "2px 2px 4px rgba(0,0,0,0.8)" }}
                >
                  {mood.name}
                </span>
              </div>
            </div>
          );
        })}
      </div>

      {/* Movies Result */}
      {selectedMood && (
        <div className="mt-8">
          <h3 className="text-2xl font-bold mb-6 text-yellow-500">
            {moods.find(m => m.id === selectedMood)?.name} Top Picks
          </h3>

          <div className="flex gap-6 flex-wrap justify-center sm:justify-start">
            {movies.map((movieObj) => (
              <MovieCard
                key={movieObj.id}
                movieObj={movieObj}
                title={movieObj.title}
                posterUrl={movieObj.poster_path}
                watchlist={watchlist}
                handleAddtoWatchlist={handleAddtoWatchlist}
                handleRemoveFromWatchlist={handleRemoveFromWatchlist}
              />
            ))}
          </div>
        </div>
      )}

      {/* Placeholder when no mood is selected */}
      {!selectedMood && (
        <div className="h-64 flex flex-col items-center justify-center border-2 border-dashed border-neutral-800 rounded-xl text-neutral-500">
          <i className="fa-solid fa-masks-theater text-5xl mb-4 text-neutral-600"></i>
          <p className="text-xl">Select a mood above to discover movies</p>
        </div>
      )}
    </div>
  );
}

export default MoodSelector;
