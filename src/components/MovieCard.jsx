import React from 'react'

function MovieCard({ title, posterUrl, movieObj, watchlist, handleAddtoWatchlist, handleRemoveFromWatchlist }) {
  let isWatchlisted = false;
  
  if (watchlist) {
    for (let i = 0; i < watchlist.length; i++) {
      if (watchlist[i].id === movieObj.id) {
        isWatchlisted = true;
        break;
      }
    }
  }

  // Generate mock Rotten Tomatoes score (just taking the vote average and tweaking it)
  const rtScore = Math.floor(movieObj.vote_average * 10);

  return (
    <div className='w-48 sm:w-56 bg-neutral-900 rounded-lg overflow-hidden group shadow-lg flex flex-col hover:-translate-y-1 transition-transform duration-300'>
      {/* Poster Section */}
      <div 
        className='relative h-72 sm:h-80 w-full bg-cover bg-center cursor-pointer' 
        style={{ backgroundImage: `url(https://image.tmdb.org/t/p/w500/${posterUrl})` }}
      >
        {/* Title with Gradient Shadow overlay */}
        <div className='absolute bottom-0 w-full p-3 bg-gradient-to-t from-neutral-900 via-neutral-900/80 to-transparent pt-12'>
          <h3 className='text-white font-bold leading-tight line-clamp-2 drop-shadow-md'>{title}</h3>
        </div>

        {/* Hover Overlay with Add to Watchlist Button */}
        <div className='absolute inset-0 bg-black/60 opacity-0 group-hover:opacity-100 flex items-center justify-center transition-opacity duration-300 backdrop-blur-sm'>
          {isWatchlisted ? (
            <button 
              onClick={() => handleRemoveFromWatchlist(movieObj)}
              className='flex items-center gap-2 bg-red-600 hover:bg-red-700 text-white px-4 py-2 rounded-full font-semibold transition-colors'
            >
              <i className="fa-solid fa-check"></i> Remove
            </button>
          ) : (
            <button 
              onClick={() => handleAddtoWatchlist(movieObj)}
              className='flex items-center gap-2 bg-yellow-500 hover:bg-yellow-600 text-black px-4 py-2 rounded-full font-bold transition-colors'
            >
              <i className="fa-solid fa-plus"></i> Watchlist
            </button>
          )}
        </div>

        {/* Top Left Bookmark indicator (always visible) */}
        {isWatchlisted && (
          <div className='absolute top-0 left-0 bg-yellow-500/90 w-8 h-10 flex text-black justify-center items-start pt-1' style={{ clipPath: "polygon(0 0, 100% 0, 100% 100%, 50% 80%, 0 100%)" }}>
            <i className="fa-solid fa-check text-sm mt-1"></i>
          </div>
        )}
      </div>

      {/* Ratings Section Below Card */}
      <div className='p-3 bg-neutral-900 flex-grow flex flex-col justify-between'>
        <div className='flex items-center gap-3 text-sm font-semibold'>
          {/* TMDB Rating */}
          <div className='flex items-center text-gray-300 gap-1'>
            <i className="fa-solid fa-star text-yellow-500"></i>
            <span>{movieObj.vote_average.toFixed(1)}</span>
          </div>

          {/* Rotten Tomatoes Mock */}
          <div className='flex items-center text-gray-300 gap-1'>
            <img src="https://upload.wikimedia.org/wikipedia/commons/5/5b/Rotten_Tomatoes.svg" alt="RT" className='w-4 h-4' />
            <span>{rtScore}%</span>
          </div>
        </div>
      </div>
    </div>
  )
}

export default MovieCard