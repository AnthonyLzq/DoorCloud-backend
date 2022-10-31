class DateTimeHelpers {
  /**
   * Get the current timestamp in milliseconds
   * @returns {number} - The current timestamp
   */
  getTimeStamp() {
    return new Date().getTime();
  }
}

export default DateTimeHelpers;
