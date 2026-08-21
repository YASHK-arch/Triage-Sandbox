import React, { useState, useEffect } from "react";

// TMDB Genre ID configuration
const genreids = {
  28: "Action",
  12: "Adventure",
  16: "Animation",
  35: "Comedy",
  80: "Crime",
  99: "Documentary",
  18: "Drama",
  10751: "Family",
  14: "Fantasy",
  36: "History",
  27: "Horror",
  10402: "Music",
  9648: "Mystery",
  10749: "Romance",
  878: "Sci-Fi",
  10770: "TV Movie",
  53: "Thriller",
  10752: "War",
  37: "Western",
};

function Watchlist({ watchlist, setWatchlist, handleRemoveFromWatchlist }) {
  const [search, setSearch] = useState("");
  const [genreList, setGenreList] = useState(["All Genres"]);
  const [currGenre, setCurrGenre] = useState("All Genres");

  useEffect(() => {
    let temp = watchlist.map((movieObj) => {
      // Pick the first genre, or default to generic if none
      return genreids[movieObj.genre_ids[0]] || "Generic";
    });
    // extract unique genres
    let uniqueGenres = new Set(temp);
    setGenreList(["All Genres", ...uniqueGenres]);
  }, [watchlist]);

  const handleSearch = (e) => {
    setSearch(e.target.value);
  };

  const handleFilter = (genre) => {
    setCurrGenre(genre);
  };

  const sortIncreasing = () => {
    let sortedWatchlist = [...watchlist].sort((movieA, movieB) => movieA.vote_average - movieB.vote_average);
    setWatchlist(sortedWatchlist);
  };

  const sortDecreasing = () => {
    let sortedWatchlist = [...watchlist].sort((movieA, movieB) => movieB.vote_average - movieA.vote_average);
    setWatchlist(sortedWatchlist);
  };

  return (
    <div className="p-4 md:p-8 max-w-7xl mx-auto">
      <h2 className="text-3xl font-bold mb-6 border-l-4 border-yellow-500 pl-4">Your Watchlist</h2>

      {/* Genre Filter */}
      <div className="flex justify-center flex-wrap gap-3 mb-6">
        {genreList.map((genre, idx) => {
          return (
            <div
              key={idx}
              onClick={() => handleFilter(genre)}
              className={`flex justify-center items-center h-[2.5rem] w-[8rem] rounded-full text-white font-bold cursor-pointer transition-colors ${
                currGenre === genre ? "bg-yellow-500 text-black" : "bg-neutral-800 hover:bg-neutral-700"
              }`}
            >
              {genre}
            </div>
          );
        })}
      </div>

      {/* Search Bar */}
      <div className="flex justify-center my-6">
        <div className="relative w-full max-w-md">
          <input
            onChange={handleSearch}
            value={search}
            className="w-full h-[3rem] bg-neutral-800 outline-none px-4 py-2 border border-neutral-700 rounded-full text-white focus:border-yellow-500 transition-colors"
            type="text"
            placeholder="Search Movies..."
          />
          <i className="fa-solid fa-magnifying-glass absolute right-4 top-1/2 -translate-y-1/2 text-gray-400"></i>
        </div>
      </div>

      {/* Table */}
      <div className="overflow-hidden rounded-lg border border-neutral-700 bg-neutral-900 shadow-md">
        <table className="w-full text-left text-sm text-gray-300">
          <thead className="bg-neutral-800 text-gray-200 uppercase font-semibold">
            <tr>
              <th className="px-6 py-4">Title</th>
              <th className="px-6 py-4">
                <div className="flex items-center gap-2">
                  <i onClick={sortIncreasing} className="fa-solid fa-arrow-up cursor-pointer hover:text-yellow-500"></i>
                  Rating
                  <i onClick={sortDecreasing} className="fa-solid fa-arrow-down cursor-pointer hover:text-yellow-500"></i>
                </div>
              </th>
              <th className="px-6 py-4">Popularity</th>
              <th className="px-6 py-4">Genre</th>
              <th className="px-6 py-4 text-center">Action</th>
            </tr>
          </thead>

          <tbody className="divide-y divide-neutral-800">
            {watchlist
              .filter((movieObj) => {
                if (currGenre === "All Genres") {
                  return true;
                } else {
                  return genreids[movieObj.genre_ids[0]] === currGenre;
                }
              })
              .filter((movieObj) => {
                return movieObj.title.toLowerCase().includes(search.toLowerCase());
              })
              .map((movieObj) => (
                <tr key={movieObj.id} className="hover:bg-neutral-800/50 transition-colors">
                  <td className="px-6 py-4 flex items-center gap-4">
                    <img
                      className="h-20 w-14 object-cover rounded-md shadow"
                      src={`https://image.tmdb.org/t/p/w500/${movieObj.poster_path}`}
                      alt={movieObj.title}
                    />
                    <div className="font-bold text-white text-lg">{movieObj.title}</div>
                  </td>
                  <td className="px-6 py-4">
                    <div className="flex items-center gap-1 font-semibold text-yellow-500">
                      <i className="fa-solid fa-star"></i> {movieObj.vote_average.toFixed(1)}
                    </div>
                  </td>
                  <td className="px-6 py-4">{movieObj.popularity.toFixed(1)}</td>
                  <td className="px-6 py-4">
                    <span className="px-3 py-1 bg-neutral-700 text-gray-200 rounded-full text-xs font-bold">
                      {genreids[movieObj.genre_ids[0]] || "Generic"}
                    </span>
                  </td>
                  <td className="px-6 py-4 text-center">
                    <button
                      onClick={() => handleRemoveFromWatchlist(movieObj)}
                      className="text-red-500 hover:text-red-400 font-semibold cursor-pointer p-2 rounded hover:bg-red-500/10 transition-colors"
                    >
                      <i className="fa-solid fa-trash mr-1"></i> Remove
                    </button>
                  </td>
                </tr>
              ))}
          </tbody>
        </table>
        
        {watchlist.length === 0 && (
          <div className="p-8 text-center text-gray-500">
            Your watchlist is empty. Add some movies!
          </div>
        )}
      </div>
    </div>
  );
}

export default Watchlist;