// Function that returns a Promise (not necessarily async itself)
function test() {
  // A Promise constructor takes an executor function with resolve and reject arguments
  return new Promise((resolve, reject) => {
    const condition = true;

    if (condition) {
      resolve("here is the data from the DB");
    } else {
      reject("sorry, couldn't get data");
    }
  });
}

// To see the result, you need to call the function and use .then() or await
test()
  .then(data => console.log('Success:', data))
  .catch(error => console.error('Error:', error));

// console.log(test) would just print the function definition,
// but the line above executes the logic.
function alarm(person,delay) {
    return new Promise((resolve,reject)=>{
        if (delay<0) {
            reject("alarm delay can not be negative");

        }
        setTimeout(()=>{
            resolve(`wakee up ,${person}!`);
        },delay);
    });

}
alarm("abebe",2000)
.then((data)=>console.log(data))
.catch((err)=>console.log(err));