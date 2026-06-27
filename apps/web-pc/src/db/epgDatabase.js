import Dexie from 'dexie';

export const epgDb = new Dexie('EPGDatabase');

// Define database schema
// start_timestamp and stop_timestamp are integers (milliseconds)
// Version 2: clears stale data where channel_id was stored as EPG ID instead of stream_id
epgDb.version(1).stores({
  programs: 'id, channel_id, start_timestamp, stop_timestamp, [channel_id+start_timestamp]'
});
epgDb.version(2).stores({
  programs: 'id, channel_id, start_timestamp, stop_timestamp, [channel_id+start_timestamp]'
}).upgrade(tx => {
  // Clear all programs — stale data had wrong channel_id (EPG ID vs stream_id)
  return tx.table('programs').clear();
});
epgDb.version(3).stores({
  programs: 'id, channel_id, start_timestamp, stop_timestamp, [channel_id+start_timestamp]'
}).upgrade(tx => {
  return tx.table('programs').clear();
});
epgDb.version(4).stores({
  programs: 'id, channel_id, start_timestamp, stop_timestamp, [channel_id+start_timestamp]'
}).upgrade(tx => {
  return tx.table('programs').clear();
});
epgDb.version(5).stores({
  programs: 'id, channel_id, start_timestamp, stop_timestamp, [channel_id+start_timestamp]'
}).upgrade(tx => {
  // Clear all programs again to fix the c.id vs c.stream_id mismatch bug
  return tx.table('programs').clear();
});

// Helper methods
export const saveProgramsToDb = async (programs) => {
  // Use bulkPut for fast bulk inserts without throwing on duplicate IDs
  try {
    await epgDb.programs.bulkPut(programs);
  } catch (err) {
    console.error("Failed to save programs to IndexedDB:", err);
  }
};

export const getProgramsForChannelRange = async (channelId, startTs, stopTs) => {
  try {
    // Get programs for channel that overlap with the requested time window
    // i.e., program starts before the window ends, AND program ends after the window starts
    return await epgDb.programs
      .where('[channel_id+start_timestamp]')
      .between(
        [channelId, 0], // Start of time for this channel
        [channelId, stopTs] // End of our window
      )
      .filter(program => program.stop_timestamp > startTs) // Ensure it hasn't ended before our window starts
      .toArray();
  } catch (err) {
    console.error("Failed to get programs from IndexedDB:", err);
    return [];
  }
};

export const clearEpgDb = async () => {
  try {
    await epgDb.programs.clear();
  } catch (err) {
    console.error("Failed to clear EPG IndexedDB:", err);
  }
};

export const purgeStaleEpgPrograms = async () => {
  try {
    const twoDaysAgo = Date.now() - (48 * 60 * 60 * 1000);
    const count = await epgDb.programs.where('stop_timestamp').below(twoDaysAgo).delete();
    if (count > 0) {
      console.log(`Purged ${count} stale EPG programs from IndexedDB.`);
    }
  } catch (err) {
    console.error("Failed to purge stale EPG programs:", err);
  }
};
