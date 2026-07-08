import { useEffect, useState } from "react";
import { salaryGroupByJob } from "../../FO/salaries/salariesService";

export default function SalaryJob() {
    const [data, setData] = useState([])
    useEffect(() => {
        async function load() {
            const resultat = await salaryGroupByJob()
            setData(resultat)
        }
        load()
    }, [])
    if (!data) {
        return <div className="emp-page"><div className="emp-loading">Chargement…</div></div>;
    }
    return (
        <div>
            <table border={1}>
                <thead>
                    <th>Poste</th>
                    <th>Total</th>
                </thead>
                <tbody>
                    {data.map(row => (
                        <tr key={row.job}>
                            <td>{row.job}</td>
                            <td>{row.total}</td>
                        </tr>
                    ))}
                </tbody>
            </table>
        </div>
    );
}