import React, { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import axios from "axios";

const API_KEY = "3aec63790d50f3b9fc2efb4c15a8cf99";

function MovieModal({ movie, onClose }) {
  const [scenes, setScenes] = useState([]);
  const [currentScene, setCurrentScene] = useState(0);
  const [details, setDetails] = useState(null);
  const [trailer, setTrailer] = useState(null);
  const [isPlayingTrailer, setIsPlayingTrailer] = useState(false);

  useEffect(() => {
    if (!movie) return;

    let mounted = true;

    async function fetchData() {
      try {
        const [detailRes, imagesRes, videosRes] = await Promise.all([
          axios.get(
            `https://api.themoviedb.org/3/movie/${movie.id}?api_key=${API_KEY}&language=en-US`
          ),
          axios.get(
            `https://api.themoviedb.org/3/movie/${movie.id}/images?api_key=${API_KEY}`
          ),
          axios.get(
            `https://api.themoviedb.org/3/movie/${movie.id}/videos?api_key=${API_KEY}&language=en-US`
          ),
        ]);
        if (!mounted) return;
        setDetails(detailRes.data);
        // Build a scene slider from backdrops. Fall back to the card poster.
        const backdrops = imagesRes.data.backdrops || [];
        const slideImages = backdrops.length
          ? backdrops.map((b) => b.file_path)
          : [movie.backdrop_path || movie.poster_path];
        setScenes(slideImages);

        const videos = videosRes.data.results || [];
        const trailerVideo =
          videos.find((v) => v.type === "Trailer" && v.site === "YouTube" && v.official) ||
          videos.find((v) => v.type === "Trailer" && v.site === "YouTube") ||
          null;
        setTrailer(trailerVideo);
      } catch (error) {
        console.error("Failed to load movie details:", error);
      }
    }

    fetchData();
    return () => {
      mounted = false;
    };
  }, [movie]);

  useEffect(() => {
    if (scenes.length === 0 || isPlayingTrailer) return;
    const timer = setInterval(() => {
      setCurrentScene((prev) => (prev + 1) % scenes.length);
    }, 5000);
    return () => clearInterval(timer);
  }, [scenes.length, isPlayingTrailer]);

  // Close on Escape and prevent background scroll while open.
  useEffect(() => {
    const onKeyDown = (e) => {
      if (e.key === "Escape") onClose();
    };
    document.addEventListener("keydown", onKeyDown);
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.removeEventListener("keydown", onKeyDown);
      document.body.style.overflow = prevOverflow;
    };
  }, [onClose]);

  if (!movie) return null;

  const backdropUrl = scenes[currentScene]
    ? `https://image.tmdb.org/t/p/original/${scenes[currentScene]}`
    : `https://image.tmdb.org/t/p/w500/${movie.poster_path}`;

  const desc = details?.overview || movie.overview || "No description available.";
  const year = (details?.release_date || "").slice(0, 4);
  const genres = details?.genres?.map((g) => g.name).join(", ") || "Movie";
  const rating = (details?.vote_average ?? movie.vote_average ?? 0).toFixed(1);
  const runtime = details?.runtime ? `${details.runtime} min` : "";
  const releaseDate = details?.release_date || "";
  const languages = details?.spoken_languages?.map((l) => l.english_name).join(", ") || "";
  const tagline = details?.tagline || "";

  return createPortal(
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm"
      onClick={onClose}
      role="dialog"
      aria-modal="true"
    >
      <div
        className="relative w-full max-w-4xl max-h-[90vh] overflow-y-auto rounded-2xl bg-neutral-900 shadow-2xl border border-neutral-700"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Scene Slider */}
        <div className="relative h-64 sm:h-80 md:h-96 w-full bg-neutral-950 overflow-hidden">
          {isPlayingTrailer && trailer ? (
            <div className="absolute inset-0 z-10 bg-black flex items-center justify-center">
              <iframe
                className="w-full h-full"
                src={`https://www.youtube.com/embed/${trailer.key}?autoplay=1`}
                title={`${movie.title} Trailer`}
                frameBorder="0"
                allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
                allowFullScreen
              ></iframe>
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  setIsPlayingTrailer(false);
                }}
                className="absolute top-4 right-4 z-20 w-10 h-10 rounded-full bg-black/60 hover:bg-black/80 border border-white/20 text-white flex items-center justify-center transition-colors shadow-lg"
                aria-label="Close trailer"
              >
                <i className="fa-solid fa-xmark"></i>
              </button>
            </div>
          ) : (
            <>
              <div
                className="absolute inset-0 bg-cover bg-center transition-all duration-1000"
                style={{ backgroundImage: `url(${backdropUrl})` }}
              />
              <div className="absolute inset-0 bg-gradient-to-t from-neutral-900 via-neutral-900/40 to-transparent pointer-events-none" />
            </>
          )}

          {/* Badge + Rating */}
          <div className="absolute top-4 left-4 flex items-center gap-2">
            <span className="bg-yellow-500 text-black text-xs font-black px-3 py-1 rounded-full">
              ★ {rating}
            </span>
            {runtime && (
              <span className="bg-black/60 text-white text-xs font-semibold px-3 py-1 rounded-full">
                {runtime}
              </span>
            )}
          </div>

          {/* Scene slider dots */}
          {scenes.length > 1 && (
            <div className="absolute bottom-4 left-1/2 -translate-x-1/2 flex gap-2">
              {scenes.map((_, idx) => (
                <button
                  key={idx}
                  onClick={(e) => {
                    e.stopPropagation();
                    setCurrentScene(idx);
                  }}
                  className={`h-2 rounded-full transition-all duration-300 ${
                    idx === currentScene ? "w-8 bg-yellow-500" : "w-2 bg-white/50 hover:bg-white"
                  }`}
                  aria-label={`Scene ${idx + 1}`}
                />
              ))}
            </div>
          )}

          {/* Scene navigation arrows */}
          {!isPlayingTrailer && scenes.length > 1 && (
            <>
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  setCurrentScene((prev) => (prev - 1 + scenes.length) % scenes.length);
                }}
                className="absolute left-2 top-1/2 -translate-y-1/2 w-9 h-9 rounded-full bg-black/50 border border-white/20 text-white flex items-center justify-center hover:bg-black/70 transition-colors"
                aria-label="Previous scene"
              >
                &#8249;
              </button>
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  setCurrentScene((prev) => (prev + 1) % scenes.length);
                }}
                className="absolute right-2 top-1/2 -translate-y-1/2 w-9 h-9 rounded-full bg-black/50 border border-white/20 text-white flex items-center justify-center hover:bg-black/70 transition-colors"
                aria-label="Next scene"
              >
                &#8250;
              </button>
            </>
          )}
        </div>

        {/* Details */}
        <div className="p-6 md:p-8">
          <p className="text-sm text-yellow-500 font-bold mb-1">{year}</p>
          <h2 className="text-3xl md:text-4xl font-black text-white leading-tight mb-4">
            {movie.title}
          </h2>

          {/* Detailed description block */}
          <div className="space-y-3 text-gray-300 text-sm mb-6">
            <p className="leading-relaxed">{desc}</p>
            <div className="flex gap-2">
              <span className="font-bold text-white w-24 flex-shrink-0">Genres:</span>
              <span>{genres}</span>
            </div>
            {releaseDate && (
              <div className="flex gap-2">
                <span className="font-bold text-white w-24 flex-shrink-0">Released:</span>
                <span>{releaseDate}</span>
              </div>
            )}
            {runtime && (
              <div className="flex gap-2">
                <span className="font-bold text-white w-24 flex-shrink-0">Runtime:</span>
                <span>{runtime}</span>
              </div>
            )}
            {languages && (
              <div className="flex gap-2">
                <span className="font-bold text-white w-24 flex-shrink-0">Languages:</span>
                <span>{languages}</span>
              </div>
            )}
            {tagline && (
              <div className="flex gap-2 italic text-gray-400">
                <span className="font-bold text-white w-24 flex-shrink-0">Tagline:</span>
                <span>{tagline}</span>
              </div>
            )}
          </div>

          {/* Actions */}
          <div className="flex flex-wrap items-center gap-4">
            <button className="flex items-center gap-2 px-6 py-3 bg-yellow-500 hover:bg-yellow-600 text-black rounded-full font-bold text-sm transition-colors">
              <i className="fa-solid fa-play"></i> Watch
            </button>
            {trailer && !isPlayingTrailer && (
              <button
                onClick={() => setIsPlayingTrailer(true)}
                className="flex items-center gap-2 px-6 py-3 bg-red-600 hover:bg-red-700 text-white rounded-full font-bold text-sm transition-colors"
              >
                <i className="fa-brands fa-youtube"></i> Watch Trailer
              </button>
            )}
            <button className="flex items-center gap-2 px-6 py-3 bg-white/10 hover:bg-white/20 border border-white/20 text-white rounded-full font-semibold text-sm transition-colors">
              <i className="fa-solid fa-star"></i> Review
            </button>
            <button
              onClick={onClose}
              className="flex items-center gap-2 px-6 py-3 bg-neutral-800 hover:bg-neutral-700 text-gray-300 rounded-full font-semibold text-sm transition-colors"
            >
              <i className="fa-solid fa-xmark"></i> Close
            </button>
          </div>
        </div>
      </div>
    </div>,
    document.body
  );
}

export default MovieModal;