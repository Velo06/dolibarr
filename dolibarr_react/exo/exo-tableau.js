// Salariés normalisés (forme de mapEmployee)
const employees = [
  { id: 1, fullName: "Alice Martin",  job: "Développeuse", gender: "woman", monthlySalary: 3200, isActive: true,  isEmployee: true },
  { id: 2, fullName: "Bob Durand",    job: "Comptable",    gender: "man",   monthlySalary: 2800, isActive: true,  isEmployee: true },
  { id: 3, fullName: "Chloé Petit",   job: "Développeuse", gender: "woman", monthlySalary: 3500, isActive: false, isEmployee: true },
  { id: 4, fullName: "David Lefevre", job: "Commercial",   gender: "man",   monthlySalary: 2600, isActive: true,  isEmployee: true },
  { id: 5, fullName: "Eve Roux",      job: "RH",           gender: "",      monthlySalary: 3000, isActive: true,  isEmployee: false },
];

// Salaires normalisés (forme de mapSalary)
const salaries = [
  { id: 10, employeeId: 1, label: "Salaire juin",    amount: 3200, isPaid: true  },
  { id: 11, employeeId: 1, label: "Salaire juillet", amount: 3200, isPaid: false },
  { id: 12, employeeId: 2, label: "Salaire juin",    amount: 2800, isPaid: false },
  { id: 13, employeeId: 3, label: "Salaire juin",    amount: 3500, isPaid: true  },
  { id: 14, employeeId: 4, label: "Salaire juin",    amount: 2600, isPaid: false },
];

// Paiements normalisés (forme de mapPayment) — date = timestamp Unix (secondes)
const payments = [
  { id: 100, salaryId: 10, amount: 3200, date: 1717200000, typeId: 2 }, // juin 2024
  { id: 101, salaryId: 11, amount: 1000, date: 1719792000, typeId: 4 }, // juillet 2024
  { id: 102, salaryId: 12, amount: 1400, date: 1717200000, typeId: 7 }, // juin 2024
  { id: 103, salaryId: 12, amount:  700, date: 1719792000, typeId: 7 }, // juillet 2024
  { id: 104, salaryId: 13, amount: 3500, date: 1717200000, typeId: 2 }, // juin 2024
];

// 1.1
const fullNames = employees.map(employees => employees.fullName);
console.log("fullName:" + fullNames)

// 1.2
const isActive = employees.filter(employees => employees.isActive === true);
console.log("isActive:" + JSON.stringify(isActive))

// 1.3
// efa corrige
// nanadino salaries => fa tode condition fotsiny no nataoko teo
const unpaid = salaries.filter(salaries => salaries.isPaid === false).map(salaries => salaries.label);
console.log("unpaid:" + unpaid)

// 1.4
function findEmployee(id) {
    return employees.find(employees => employees.id === id)
}
console.log("get employe by id:" + JSON.stringify(findEmployee(5)))

// 2.1
function sommePayement(pay) {
    const sumAmount = pay.reduce((somme, init) => somme + init.amount, 0)
    return sumAmount;
}
console.log("somme montant paye:" + sommePayement(payments))

// 2.2
function moyenneMontant(p) {
    const moyenne = p ? sommePayement(p) / p.length : 0;
    return moyenne
}
console.log("moyenne montant paye:" + moyenneMontant(payments))

// 2.3
// efa corrige
// diso emplacement parenthese
// si object, tokony mitovy ny key initial sy key final (total, count)
const sumObject = payments.reduce((somme, init) => ({total: somme.total + init.amount, count: somme.count + 1}), {total: 0, count: 0})
console.log("somme et count:" + JSON.stringify(sumObject))

// 2.4
function topEarn(salaire) {
    const topEarn = [...salaire].sort((a,b) => b.amount - a.amount)
    return topEarn[0]
}
console.log("topEarn sort:" + JSON.stringify(topEarn(salaries)))

function topEarnReduce(salaire) {
    const top = salaire.reduce((a, b) => b.amount > a.amount ? b : a, salaire[0])
    return top
}
console.log("topEarn reduce:" + JSON.stringify(topEarnReduce(salaries)))

// 3.1
// c'est quoi l'interet d'indexer ?
// comment lister les valeurs dans nameIndex ?
function nameIndex(employees) {
    const nameIndex = new Map(employees.map((employees) => [String(employees.id), employees.fullName]))
    console.log("name index:" + nameIndex.get(String(1)))
    return nameIndex
}

// 3.2
const ni = nameIndex(employees)
const enrichir = salaries.map((sal) => ({...sal, employeeName: ni.get(String(sal.employeeId))}))
console.log("enrichi:" + JSON.stringify(enrichir))

// 3.3
// difference netre filter et find ?
function getPaiementByidSalary(idSal) {
    const pay = payments.filter(p => p.salaryId === idSal)
    return pay
}
const group = salaries.map((s) => ({id: s.id, payments: getPaiementByidSalary(s.id)}))
console.log("group salary:" + JSON.stringify(group))

// 3.4
function sommePayementByIdSalaire(idSal) {
    const sumAmount = payments.filter(p => p.salaryId === idSal).reduce((somme, init) => somme + init.amount, 0)
    return sumAmount;
}
const resteSalaire = salaries.map((s) => ({id: s.id, label: s.label, resteAPayer: s.amount - sommePayementByIdSalaire(s.id)}))
console.log("reste:" + JSON.stringify(resteSalaire))

// 4.1 ?
function groupAndSum(items, keyOf, valueOf) {
  const result = new Map();
  for (const item of items) {
    const key = keyOf(item);
    const value = Number(valueOf(item));
    const bucket = { total: 0, count: 0 };
    bucket.total += value;
    bucket.count += 1;
    result.set(key, bucket);
    // console.log("result:" + JSON.stringify(result.get(7)))
  }
  return result;
}
console.log("groupAndSum:" + groupAndSum(payments, (p) => p.typeId, (p) => p.amount))
